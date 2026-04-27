"""
Async SQLAlchemy engine for use within LangGraph graph nodes.

This is separate from `session.py` (sync engine) which continues to be used
by Alembic migrations and non-async contexts.

The DATABASE_URL must use the asyncpg driver:
    postgresql+asyncpg://user:password@host:port/dbname

The config builds this URL automatically from DATABASE_URL by replacing
the scheme prefix.
"""

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

# Build async URL from the existing DATABASE_URL by swapping the driver
_sync_url: str = settings.DATABASE_URL or settings.SQLALCHEMY_DATABASE_URI

# If the url already uses asyncpg, keep it; otherwise replace the prefix
if _sync_url.startswith("postgresql+asyncpg://"):
    _async_url = _sync_url
elif _sync_url.startswith("postgresql://"):
    _async_url = _sync_url.replace("postgresql://", "postgresql+asyncpg://", 1)
else:
    _async_url = _sync_url  # fallback — let SQLAlchemy raise a clear error

async_engine = create_async_engine(
    _async_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    echo=False,
)

AsyncSessionLocal = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)
