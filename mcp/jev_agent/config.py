"""Agent settings: environment variables with the JEV_ prefix, TYPESAFE_API_KEY and the .env file."""

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import AliasChoices, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="JEV_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        frozen=True,
        populate_by_name=True,
    )

    host: str = Field(default="127.0.0.1", min_length=1, description="Bind address")
    port: int = Field(default=8765, ge=1, le=65535, description="Bind port")
    mcp_path: str = Field(default="/mcp", pattern=r"^/[A-Za-z0-9_\-/]*$", description="MCP endpoint path")
    allowed_origins: Annotated[list[str], NoDecode] = Field(
        default=["http://localhost:5173", "http://127.0.0.1:5173"],
        description="CORS origins, comma-separated in the environment",
    )
    max_batch_races: int = Field(default=500, ge=1, le=10_000, description="Max queries per predict_races call")
    log_level: Literal["critical", "error", "warning", "info", "debug"] = "info"

    typesafe_api_key: SecretStr | None = Field(
        default=None,
        validation_alias=AliasChoices("TYPESAFE_API_KEY", "JEV_TYPESAFE_API_KEY"),
        description="TypeSafe AI API key",
    )
    typesafe_model: str = Field(default="jev-latest", min_length=1, description="Jev model name, pin a version for stable results")
    typesafe_base_url: str | None = Field(default=None, description="TypeSafe API root, default is the SDK value")
    typesafe_timeout: float = Field(default=10.0, gt=0, le=120, description="Timeout of one Jev call, seconds")
    max_concurrency: int = Field(default=4, ge=1, le=64, description="Parallel Jev calls inside predict_races")

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [o.strip() for o in value.split(",") if o.strip()]
        return value

    @field_validator("allowed_origins")
    @classmethod
    def check_origins(cls, origins: list[str]) -> list[str]:
        for origin in origins:
            if origin != "*" and not origin.startswith(("http://", "https://")):
                raise ValueError(f"invalid origin: {origin!r}")
        return [o.rstrip("/") for o in origins]

    @field_validator("log_level", mode="before")
    @classmethod
    def lower_log_level(cls, value: object) -> object:
        return value.lower() if isinstance(value, str) else value

    @field_validator("typesafe_api_key", "typesafe_base_url", mode="before")
    @classmethod
    def empty_is_unset(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value.strip() if isinstance(value, str) else value

    @field_validator("typesafe_base_url")
    @classmethod
    def check_base_url(cls, value: str | None) -> str | None:
        if value is not None and not value.startswith(("http://", "https://")):
            raise ValueError(f"invalid base url: {value!r}")
        return value.rstrip("/") if value else value


@lru_cache
def get_settings() -> Settings:
    return Settings()
