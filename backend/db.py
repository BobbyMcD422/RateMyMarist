from collections.abc import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from backend.config import settings


class Base(DeclarativeBase):
    pass


engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from backend import models

    Base.metadata.create_all(bind=engine)
    snapshot_columns = {column["name"] for column in inspect(engine).get_columns("rmp_professor_snapshots")}
    if "profile_url" not in snapshot_columns:
        with engine.begin() as connection:
            connection.execute(
                text("ALTER TABLE rmp_professor_snapshots ADD COLUMN profile_url VARCHAR(500)")
            )
