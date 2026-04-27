import sys
import asyncio
from fastapi import FastAPI
from sqlalchemy.sql import text
import redis.asyncio as redis
from fastapi_limiter import FastAPILimiter

from app.db.session import engine
from app.core.config import settings
from app.core.logging import setup_logging
from app.api.endpoints import auth, chat, report, metrics
from app.api.middleware.logging_middleware import APILoggingMiddleware
from app.models.app_user import AppUser
from app.models.authorized_user import AuthorizedUser
from app.models.document import Document
from app.services.chat_history import chat_history_service

from fastapi.middleware.cors import CORSMiddleware
from app.db.mongodb import connect_to_mongo, close_mongo_connection

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())  # type: ignore

# Initialize structured logging
setup_logging()

app = FastAPI(title="Retail Analytics API")

# Configure CORS
origins = [
    "http://localhost:5173",  # Frontend dev server (Vite)
    "http://127.0.0.1:5173",
    "http://localhost:3000",  # Frontend dev server (NPM/React)
    "http://127.0.0.1:3000",
]

# Add Logging Middleware first so it wraps everything
app.add_middleware(APILoggingMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(chat.router, prefix="/chat", tags=["chat"])
app.include_router(report.router, prefix="/report", tags=["report"])
app.include_router(metrics.router, prefix="/metrics", tags=["metrics"])


@app.on_event("startup")
async def on_startup():
    try:
        # Initialize Rate Limiter
        redis_conn = redis.from_url(
            settings.REDIS_URL, encoding="utf8", decode_responses=True
        )
        await FastAPILimiter.init(redis_conn)
        print("Rate Limiter initialized with Redis.")

        # Initialize MongoDB
        await connect_to_mongo()
        await chat_history_service.ensure_indexes()
        print("MongoDB initialized successfully for Chat History.")

        # Test the database connection
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
            print("Successfully connected to the database!")

            # Create pgvector extension if it doesn't exist
            vector_extension_ready = False
            try:
                connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
                connection.commit()
                vector_extension_ready = True
                print("pgvector extension initialized successfully.")
            except Exception as e:
                print(f"Could not initialize pgvector extension: {e}")

        # Always ensure auth tables exist, even on a fresh database.
        try:
            AuthorizedUser.__table__.create(bind=engine, checkfirst=True)  # type: ignore
            AppUser.__table__.create(bind=engine, checkfirst=True)  # type: ignore
            print("Auth tables initialized successfully.")
        except Exception as e:
            print(f"Could not initialize auth tables: {e}")

        # Documents table depends on pgvector extension.
        if vector_extension_ready:
            try:
                Document.__table__.create(bind=engine, checkfirst=True)  # type: ignore
                print("Documents table initialized successfully.")
            except Exception as e:
                print(f"Could not initialize documents table: {e}")

    except Exception as e:
        print(f"Failed to connect to the database: {e}")
        # raise e


@app.on_event("shutdown")
async def on_shutdown():
    await close_mongo_connection()


@app.get("/")
def read_root():
    return {"message": "Welcome to Retail Analytics API"}
