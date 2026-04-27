from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.app_user import AppUser
from app.models.authorized_user import AuthorizedUser
from app.schemas.user import UserCreate
from app.core.security import get_password_hash
from app.services.databricks import databricks_connection


def get_user_by_email(db: Session, email: str) -> AppUser | None:
    safe_email = email.replace("'", "''")
    query = (
        f"SELECT * FROM retail_db.trusted.app_users WHERE email = '{safe_email}'"
    )

    response = databricks_connection.execute_query(query, "login_auth")

    if response["status"] == "success" and response["result"]:
        row = response["result"][0]
        return AppUser(
            id=row.get("id"),
            first_name=row.get("first_name"),
            last_name=row.get("last_name"),
            email=row.get("email"),
            password_hash=row.get("password_hash"),
            phone_number=row.get("phone_number"),
            role=row.get("role"),
            is_active=row.get("is_active", True),
            last_login=row.get("last_login"),
        )

    return None


def is_authorized_email(db: Session, email: str) -> bool:
    result = db.execute(
        select(AuthorizedUser).where(
            AuthorizedUser.work_email == email
        )
    )
    authorized_user = result.scalar_one_or_none()
    return authorized_user is not None


def create_user(db: Session, user_in: UserCreate) -> AppUser:
    db_obj = AppUser(
        email=user_in.email,
        password_hash=get_password_hash(user_in.password),
        first_name=user_in.first_name,
        last_name=user_in.last_name,
        is_active=True,
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj
