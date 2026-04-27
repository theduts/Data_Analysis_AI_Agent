from typing import Generator

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

from app.core.config import settings
from app.db.session import SessionLocal

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_db() -> Generator:
    db = None
    try:
        db = SessionLocal()
        yield db
    finally:
        if db is not None:
            db.close()


def get_current_user_subject(token: str = Depends(oauth2_scheme)) -> dict:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        subject = payload.get("sub")
        if not isinstance(subject, str) or not subject:
            raise credentials_exception

        first_name = payload.get("first_name", "")
        last_name = payload.get("last_name", "")
        role = str(payload.get("role", "USER")).upper()

        return {
            "email": subject,
            "name": f"{first_name} {last_name}".strip() or "Usuário",
            "role": role,
        }
    except JWTError:
        raise credentials_exception
