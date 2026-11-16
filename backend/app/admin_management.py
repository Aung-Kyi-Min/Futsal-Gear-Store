from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr, StringConstraints
from sqlalchemy import text

from .auth import AuthDB, AuthRoute, PASSWORD_HASHER, require_roles

router = APIRouter(dependencies=[Depends(require_roles('administrator'))], route_class=AuthRoute)
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=160, pattern=r'^[^\x00]+$')]


class ManagerCreate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    full_name: Name
    email: EmailStr
    password: SecretStr = Field(min_length=12, max_length=128)


class ManagerStatus(BaseModel):
    model_config = ConfigDict(extra='forbid')
    is_active: bool = Field(strict=True)


class ShopSettings(BaseModel):
    model_config = ConfigDict(extra='forbid')
    store_name: Name
    contact_email: EmailStr


@router.get('/managers')
def managers(db: AuthDB):
    return db.execute(text('''
        SELECT u.user_id, u.full_name, u.email, u.is_active, u.created_at
        FROM users u JOIN roles r ON r.role_id = u.role_id
        WHERE r.role_name = 'manager' ORDER BY u.created_at DESC, u.user_id
    ''')).mappings().all()


@router.post('/managers', status_code=201)
def create_manager(db: AuthDB, data: ManagerCreate):
    result = db.execute(text('''
        INSERT INTO users (full_name, email, password_hash, role_id)
        VALUES (:name, :email, :password, (SELECT role_id FROM roles WHERE role_name = 'manager'))
        ON CONFLICT (LOWER(email)) DO NOTHING
        RETURNING user_id, full_name, email, is_active, created_at
    '''), {'name': data.full_name, 'email': data.email.lower(),
           'password': PASSWORD_HASHER.hash(data.password.get_secret_value())}).mappings().one_or_none()
    if result is None:
        raise HTTPException(409, 'Email is already registered')
    db.commit()
    return result


@router.patch('/managers/{user_id}')
def update_manager(db: AuthDB, user_id: UUID, data: ManagerStatus):
    result = db.execute(text('''
        UPDATE users SET is_active = :active
        WHERE user_id = :id AND role_id = (SELECT role_id FROM roles WHERE role_name = 'manager')
        RETURNING user_id, full_name, email, is_active, created_at
    '''), {'active': data.is_active, 'id': user_id}).mappings().one_or_none()
    if result is None:
        raise HTTPException(404, 'Manager not found')
    db.commit()
    return result


@router.get('/activity')
def activity(db: AuthDB):
    return db.execute(text('''
        SELECT a.*, u.full_name AS staff_name, u.email AS staff_email FROM (
            SELECT 'stock-' || movement_id AS activity_id, changed_by_user_id,
                   'Stock adjustment' AS action, 'Variant #' || variant_id || ': ' ||
                   quantity_delta || ' units · ' || reason AS detail, created_at
            FROM inventory_movements
            UNION ALL
            SELECT 'order-' || history_id, changed_by_user_id, 'Order status',
                   'Order ' || order_id || ': ' || COALESCE(old_status, 'new') || ' → ' || new_status,
                   changed_at FROM order_status_history
        ) a LEFT JOIN users u ON u.user_id = a.changed_by_user_id
        ORDER BY a.created_at DESC, a.activity_id DESC LIMIT 100
    ''')).mappings().all()


@router.get('/settings', response_model=ShopSettings)
def settings(db: AuthDB):
    return db.execute(text('SELECT store_name, contact_email FROM shop_settings WHERE id = 1')).mappings().one()


@router.patch('/settings', response_model=ShopSettings)
def update_settings(db: AuthDB, data: ShopSettings):
    result = db.execute(text('''
        UPDATE shop_settings SET store_name = :store_name, contact_email = :contact_email
        WHERE id = 1 RETURNING store_name, contact_email
    '''), {'store_name': data.store_name, 'contact_email': str(data.contact_email)}).mappings().one()
    db.commit()
    return result
