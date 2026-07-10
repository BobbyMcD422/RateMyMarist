import json
import os
from dataclasses import dataclass

from dotenv import load_dotenv


load_dotenv(override=True)


def get_cors_origins() -> list[str]:
    value = os.getenv("CORS_ORIGINS")
    if not value:
        return ["http://localhost:5173", "http://127.0.0.1:5173"]

    try:
        origins = json.loads(value)
    except json.JSONDecodeError:
        return [origin.strip() for origin in value.split(",") if origin.strip()]

    if not isinstance(origins, list):
        raise ValueError("CORS_ORIGINS must be a JSON array or comma-separated list.")

    return [str(origin) for origin in origins]


@dataclass(frozen=True)
class Settings:
    database_url: str
    admin_api_key: str
    rmp_school_id: int
    registration_json_path: str
    cors_origins: list[str]

    def masked_database_url(self) -> str:
        if "@" not in self.database_url or ":" not in self.database_url:
            return self.database_url

        scheme_and_user, host_part = self.database_url.rsplit("@", 1)
        scheme, credentials = scheme_and_user.split("://", 1)
        user = credentials.split(":", 1)[0]
        return f"{scheme}://{user}:***@{host_part}"


settings = Settings(
    database_url=os.getenv("DATABASE_URL", "postgresql+psycopg://postgres:postgres@127.0.0.1:5433/professors"),
    admin_api_key=os.getenv("ADMIN_API_KEY", "change-me"),
    rmp_school_id=int(os.getenv("RMP_SCHOOL_ID", "563")),
    registration_json_path=os.getenv(
        "MYMARIST_REGISTRATION_JSON_PATH",
        "/app/logs/responses/registration_latest.json",
    ),
    cors_origins=get_cors_origins(),
)
