"""
Redis client for SQL query caching inside the LangGraph graph.

Uses database 1 (to avoid collision with the Rate Limiter on db=0) and a
configurable TTL (default 3600 seconds = 1 hour).

Cache keys are generated as: `query_cache:{xxh64_hash_of_question}`
"""

from typing import Optional

import hashlib
import redis.asyncio as aioredis

from app.core.config import settings


def _build_redis_url(db: int) -> str:
    if settings.REDIS_PASSWORD:
        return f"redis://:{settings.REDIS_PASSWORD}@{settings.REDIS_HOST}:{settings.REDIS_PORT}/{db}"
    return f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}/{db}"


# Singleton client — reused across all graph invocations
_cache_client: Optional[aioredis.Redis] = None


def get_cache_client() -> aioredis.Redis:
    """Return the singleton Redis cache client, creating it on first call."""
    global _cache_client
    if _cache_client is None:
        _cache_client = aioredis.from_url(
            _build_redis_url(settings.REDIS_CACHE_DB),
            decode_responses=True,
        )
    return _cache_client


def make_cache_key(question: str) -> str:
    """Generate a deterministic cache key from the user question using SHA-256."""
    normalized_question = question.strip().lower()
    hashed = hashlib.sha256(normalized_question.encode("utf-8")).hexdigest()
    return f"query_cache:{hashed}"


async def get_cached_result(question: str) -> Optional[str]:
    """Return the cached JSON result string, or None on a cache miss."""
    client = get_cache_client()
    return await client.get(make_cache_key(question))


async def set_cached_result(question: str, result_json: str) -> None:
    """Store a JSON result string with the configured TTL."""
    client = get_cache_client()
    await client.setex(
        make_cache_key(question),
        settings.REDIS_CACHE_TTL,
        result_json,
    )


async def get_cached_json(key: str) -> Optional[dict | list]:
    """Return the cached JSON as a dict/list, or None on a cache miss."""
    import json
    client = get_cache_client()
    val = await client.get(key)
    if val:
        try:
            return json.loads(val)
        except Exception:
            return None
    return None


async def set_cached_json(key: str, data: dict | list, ttl: int | None = None) -> None:
    """
    Store a dict/list as JSON.
    If ttl is None, use the default from settings.
    If ttl is 0, stored persistently (no expiration).
    """
    import json
    client = get_cache_client()
    
    if ttl == 0:
        await client.set(key, json.dumps(data))
    else:
        final_ttl = ttl if ttl is not None else settings.REDIS_CACHE_TTL
        await client.setex(key, final_ttl, json.dumps(data))


async def delete_cached_key(key: str) -> None:
    """Delete a specific key from Redis."""
    client = get_cache_client()
    await client.delete(key)


async def hget_cached_json(key: str, field: str) -> Optional[dict | list]:
    """Return the cached JSON from a Redis hash field, or None on a cache miss."""
    import json
    client = get_cache_client()
    val = await client.hget(key, field)
    if val:
        try:
            return json.loads(val)
        except Exception:
            return None
    return None


async def hset_cached_json(key: str, field: str, data: dict | list, ttl: int | None = None) -> None:
    """
    Store a dict/list as JSON in a Redis hash field.
    Updates the expiration for the entire hash key.
    """
    import json
    client = get_cache_client()
    await client.hset(key, field, json.dumps(data))
    
    if ttl == 0:
        return # No expiration
        
    final_ttl = ttl if ttl is not None else settings.REDIS_CACHE_TTL
    await client.expire(key, final_ttl)
