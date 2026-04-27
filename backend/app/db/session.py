from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

# Use DATABASE_URL from environment if available, otherwise fallback to the hardcoded URI
database_url = settings.DATABASE_URL or settings.SQLALCHEMY_DATABASE_URI

engine = create_engine(
    database_url,
    # pool_pre_ping=True helps to handle disconnected connections gracefully
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
