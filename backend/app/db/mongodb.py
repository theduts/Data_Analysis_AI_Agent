from typing import Any
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings


class MongoDB:
    client: AsyncIOMotorClient[Any] | None = None


db = MongoDB()


async def connect_to_mongo():
    db.client = AsyncIOMotorClient(settings.MONGODB_URL)


async def close_mongo_connection():
    if db.client:
        db.client.close()


def get_database():
    if db.client is None:
        raise ValueError(
            "Database client is not initialized. Please call connect_to_mongo() first."
        )
    return db.client[settings.MONGODB_DB_NAME]
