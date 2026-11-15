from typing import Annotated

from fastapi import APIRouter, Depends

from .auth import PublicUser, require_roles

router = APIRouter(prefix="/api/admin", tags=["Administration"])
StaffUser = Annotated[PublicUser, Depends(require_roles("manager", "administrator"))]


@router.get("/me", response_model=PublicUser)
def me(user: StaffUser):
    return user
