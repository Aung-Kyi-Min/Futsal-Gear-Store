import os
from datetime import datetime, timedelta, timezone
from typing import Annotated, Callable, Literal
from uuid import UUID

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr, StringConstraints
from sqlalchemy import text
from sqlalchemy.engine import Connection

from .db import postgres_engine

TOKEN_LIFETIME = timedelta(hours=1)
TOKEN_ISSUER = "futsal-gear-store"
PASSWORD_HASHER = PasswordHasher()
# Use the same verification work for unknown emails and incorrect passwords.
DUMMY_PASSWORD_HASH = PASSWORD_HASHER.hash("unused login timing placeholder")
bearer = HTTPBearer(auto_error=False)


class AuthRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()

        async def without_credentials_in_errors(request: Request):
            try:
                return await handler(request)
            except RequestValidationError as exc:
                detail = [
                    {"loc": error["loc"], "msg": error["msg"], "type": error["type"]}
                    for error in exc.errors()
                ]
                return JSONResponse(status_code=422, content={"detail": detail})

        return without_credentials_in_errors


router = APIRouter(prefix="/api/auth", tags=["Authentication"], route_class=AuthRoute)


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: SecretStr = Field(min_length=1, max_length=128)


class RegisterRequest(LoginRequest):
    full_name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=2, max_length=160, pattern=r"^[^\x00]+$")
    ]
    password: SecretStr = Field(min_length=12, max_length=128)


Role = Literal["customer", "manager", "administrator"]


class PublicUser(BaseModel):
    user_id: UUID
    full_name: str
    email: str
    role: Role


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: PublicUser


def get_auth_db():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise HTTPException(503, "Authentication database is not configured")
    with postgres_engine(database_url).connect() as db:
        yield db


def get_signing_secret() -> str:
    secret = os.getenv("AUTH_SECRET_KEY", "")
    if len(secret.encode("utf-8")) < 32:
        raise HTTPException(503, "Authentication token signing is not configured")
    return secret


AuthDB = Annotated[Connection, Depends(get_auth_db)]
SigningSecret = Annotated[str, Depends(get_signing_secret)]


def unauthorized(detail: str) -> HTTPException:
    return HTTPException(401, detail, headers={"WWW-Authenticate": "Bearer"})


@router.post("/register", status_code=201, response_model=PublicUser)
def register(data: RegisterRequest, db: AuthDB):
    password_hash = PASSWORD_HASHER.hash(data.password.get_secret_value())
    with db.begin():
        user = db.execute(
            text("""
                INSERT INTO users (full_name, email, password_hash, role_id)
                VALUES (
                    :full_name, :email, :password_hash,
                    (SELECT role_id FROM roles WHERE role_name = 'customer')
                )
                ON CONFLICT (LOWER(email)) DO NOTHING
                RETURNING user_id, full_name, email, 'customer' AS role
            """),
            {"full_name": data.full_name, "email": data.email.lower(), "password_hash": password_hash},
        ).mappings().one_or_none()
        if user is None:
            raise HTTPException(409, "Email is already registered")
    return user


@router.post("/login", response_model=LoginResponse)
def login(data: LoginRequest, secret: SigningSecret, db: AuthDB):
    user = db.execute(
        text("""
            SELECT u.user_id, u.full_name, u.email, u.password_hash, r.role_name AS role
            FROM users AS u
            JOIN roles AS r ON r.role_id = u.role_id
            WHERE LOWER(u.email) = :email AND u.is_active
        """),
        {"email": data.email.lower()},
    ).mappings().one_or_none()

    password_hash = user["password_hash"] if user else DUMMY_PASSWORD_HASH
    try:
        PASSWORD_HASHER.verify(password_hash, data.password.get_secret_value())
    except (VerificationError, InvalidHashError):
        raise unauthorized("Invalid email or password") from None
    if user is None:
        raise unauthorized("Invalid email or password")

    now = datetime.now(timezone.utc)
    access_token = jwt.encode(
        {"sub": str(user["user_id"]), "iss": TOKEN_ISSUER, "iat": now, "exp": now + TOKEN_LIFETIME},
        secret,
        algorithm="HS256",
    )
    return {"access_token": access_token, "user": user}


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    secret: SigningSecret,
    db: AuthDB,
) -> PublicUser:
    if credentials is None:
        raise unauthorized("Bearer token required")
    try:
        claims = jwt.decode(
            credentials.credentials,
            secret,
            algorithms=["HS256"],
            issuer=TOKEN_ISSUER,
            options={"require": ["sub", "iss", "iat", "exp"]},
        )
        user_id = UUID(claims["sub"])
    except (jwt.InvalidTokenError, ValueError):
        raise unauthorized("Invalid or expired bearer token") from None

    user = db.execute(
        text("""
            SELECT u.user_id, u.full_name, u.email, r.role_name AS role
            FROM users AS u
            JOIN roles AS r ON r.role_id = u.role_id
            WHERE u.user_id = :user_id AND u.is_active
        """),
        {"user_id": user_id},
    ).mappings().one_or_none()
    if user is None:
        raise unauthorized("Invalid or expired bearer token")
    return PublicUser.model_validate(user)


CurrentUser = Annotated[PublicUser, Depends(get_current_user)]


def require_roles(*allowed_roles: Role) -> Callable[[PublicUser], PublicUser]:
    def check_role(user: CurrentUser) -> PublicUser:
        if user.role not in allowed_roles:
            raise HTTPException(403, "Your role does not have permission to access this resource")
        return user

    return check_role


require_staff = require_roles("manager", "administrator")
StaffUser = Annotated[PublicUser, Depends(require_staff)]


@router.get("/me", response_model=PublicUser)
def me(user: CurrentUser):
    return user
