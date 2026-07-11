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

    section_columns = {column["name"] for column in inspect(engine).get_columns("sections")}
    section_migrations = {
        "content_hash": "ALTER TABLE sections ADD COLUMN content_hash VARCHAR(64)",
        "is_active": "ALTER TABLE sections ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE",
        "last_synced_at": "ALTER TABLE sections ADD COLUMN last_synced_at TIMESTAMP WITH TIME ZONE",
    }
    with engine.begin() as connection:
        for column_name, statement in section_migrations.items():
            if column_name not in section_columns:
                connection.execute(text(statement))

    term_columns = {column["name"] for column in inspect(engine).get_columns("terms")}
    term_migrations = {
        "starts_at": "ALTER TABLE terms ADD COLUMN starts_at DATE",
        "ends_at": "ALTER TABLE terms ADD COLUMN ends_at DATE",
        "is_active": "ALTER TABLE terms ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE",
    }
    with engine.begin() as connection:
        for column_name, statement in term_migrations.items():
            if column_name not in term_columns:
                connection.execute(text(statement))

        for table_name, column_name in (
            ("courses", "title"),
            ("sections", "title"),
            ("instructors", "display_name"),
            ("rmp_professor_snapshots", "name"),
            ("rmp_professor_snapshots", "department"),
        ):
            connection.execute(
                text(
                    f"UPDATE {table_name} SET {column_name} = replace({column_name}, '&amp;', '&') "
                    f"WHERE {column_name} LIKE '%&amp;%'"
                )
            )

    section_foreign_keys = inspect(engine).get_foreign_keys("sections")
    has_term_foreign_key = any(
        foreign_key.get("referred_table") == "terms"
        and foreign_key.get("constrained_columns") == ["term"]
        for foreign_key in section_foreign_keys
    )
    if not has_term_foreign_key:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "ALTER TABLE sections ADD CONSTRAINT fk_sections_term "
                    "FOREIGN KEY (term) REFERENCES terms(code) ON DELETE RESTRICT"
                )
            )

    from backend.services.instructor_matching import suggest_exact_instructor_links

    with SessionLocal() as db:
        suggest_exact_instructor_links(db, settings.rmp_school_id)
        db.commit()
