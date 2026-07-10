from fastapi import APIRouter

from app.api.v1.endpoints.items import router as items_router

api_router = APIRouter()

api_router.include_router(
    items_router,
    prefix="/items",
    tags=["Items"]
)