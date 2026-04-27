from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from fastapi_limiter.depends import RateLimiter  # pyright: ignore[reportMissingImports]

from app.api import deps
from app.core.config import settings
from app.core import security
from app.db import crud_user
from app.schemas.user import UserCreate, UserResponse
from app.schemas.token import Token

router = APIRouter()


@router.post(
    "/register",
    response_model=UserResponse,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def register(user_in: UserCreate, db: Session = Depends(deps.get_db)):
    if not crud_user.is_authorized_email(db, email=user_in.email):
        raise HTTPException(
            status_code=403, detail="Your email is not authorized to register."
        )
    user = crud_user.get_user_by_email(db, email=user_in.email)
    if user:
        raise HTTPException(
            status_code=400, detail="A user with this email already exists."
        )
    return crud_user.create_user(db, user_in=user_in)


@router.post(
    "/login",
    response_model=Token,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def login(
    db: Session = Depends(deps.get_db), form_data: OAuth2PasswordRequestForm = Depends()
):
    user = crud_user.get_user_by_email(db, email=form_data.username)
    if not user or not security.verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    name_claims = {
        "first_name": user.first_name,
        "last_name": user.last_name,
        "role": user.role,
    }

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(
        subject=user.email,
        expires_delta=access_token_expires,
        extra_claims=name_claims,
    )
    refresh_token = security.create_refresh_token(
        subject=user.email, extra_claims=name_claims
    )
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


@router.post("/refresh", response_model=Token)
async def refresh_token(refresh_token: str):
    from jose import jwt, JWTError

    try:
        payload = jwt.decode(
            refresh_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        email = payload.get("sub")
        if not isinstance(email, str):
            raise HTTPException(status_code=401, detail="Invalid refresh token")

        extra_claims: dict[str, str] = {}
        first_name = payload.get("first_name")
        if isinstance(first_name, str) and first_name.strip():
            extra_claims["first_name"] = first_name

        last_name = payload.get("last_name")
        if isinstance(last_name, str) and last_name.strip():
            extra_claims["last_name"] = last_name

        role = payload.get("role")
        if isinstance(role, str) and role.strip():
            extra_claims["role"] = role
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    new_access_token = security.create_access_token(
        subject=email,
        expires_delta=access_token_expires,
        extra_claims=extra_claims or None,
    )
    return {
        "access_token": new_access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(current_user: str = Depends(deps.get_current_user_subject)):
    from app.db.redis_client import get_cache_client
    client = get_cache_client()
    await client.delete(f"customer_profile_session_{current_user}")
    await client.delete(f"state_branches_session_{current_user}")
    await client.delete(f"metrics_summary_session_{current_user}")

