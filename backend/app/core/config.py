from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    SQLALCHEMY_DATABASE_URI: str = "postgresql://user:password@localhost:5432/maindb"

    # Pydantic will automatically load this from environment if available
    # Overriding the default above
    DATABASE_URL: str | None = None

    GEMINI_API_KEY: str | None = None

    # AWS Bedrock
    AWS_ACCESS_KEY_ID: str | None = None
    AWS_SECRET_ACCESS_KEY: str | None = None
    AWS_DEFAULT_REGION: str = "us-east-1"
    BEDROCK_MODEL_ID: str = "us.anthropic.claude-sonnet-4-6"
    BEDROCK_HAIKU_MODEL_ID: str = "us.anthropic.claude-3-5-haiku-20241022-v1:0"
    # anthropic.claude-3-sonnet-20240229-v1:0

    # Databricks
    DATABRICKS_ACCESS_TOKEN: str | None = None
    DATABRICKS_SERVER_HOSTNAME: str | None = None
    DATABRICKS_HTTP_PATH: str | None = None

    # JWT Config
    SECRET_KEY: str = "super_secret_key_change_in_production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Redis Config for Rate Limiting
    REDIS_URL: str = "redis://localhost:6379"

    # MongoDB settings for Audit Logging
    MONGODB_URL: str = "mongodb://user:password@localhost:27017"
    MONGODB_DB_NAME: str = "audit_logs"

    # Redis state saver settings
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_PASSWORD: str | None = None

    # Redis query cache
    REDIS_CACHE_DB: int = 1
    REDIS_CACHE_TTL: int = 3600  # 1 hour

    # Redis LangGraph checkpointer
    REDIS_CHECKPOINT_DB: int = 0

    model_config = SettingsConfigDict(env_file=(".env", ".env.local"), extra="ignore")


settings: Settings = Settings()
