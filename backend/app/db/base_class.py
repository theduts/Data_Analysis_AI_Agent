from sqlalchemy.orm import DeclarativeBase, declared_attr


class Base(DeclarativeBase):
    # Generates __tablename__ automatically based on the class name
    @declared_attr.directive
    def __tablename__(cls) -> str:
        return cls.__name__.lower()
