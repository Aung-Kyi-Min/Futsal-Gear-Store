from fastapi import APIRouter, Depends

from . import admin_inventory, admin_orders, admin_products, admin_management
from .auth import PublicUser, StaffUser, require_staff

router = APIRouter(prefix="/api/admin", tags=["Administration"], dependencies=[Depends(require_staff)])
router.include_router(admin_products.router)
router.include_router(admin_inventory.router)
router.include_router(admin_orders.router)
router.include_router(admin_management.router)


@router.get("/me", response_model=PublicUser)
def me(user: StaffUser):
    return user
