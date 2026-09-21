import pytest
from pydantic import ValidationError

from jev_agent.config import Settings


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    keys = ("HOST", "PORT", "MCP_PATH", "ALLOWED_ORIGINS", "MAX_BATCH_RACES", "LOG_LEVEL", "TYPESAFE_API_KEY",
            "TYPESAFE_MODEL", "TYPESAFE_BASE_URL", "TYPESAFE_TIMEOUT", "MAX_CONCURRENCY")
    for key in keys:
        monkeypatch.delenv(f"JEV_{key}", raising=False)
    monkeypatch.delenv("TYPESAFE_API_KEY", raising=False)


def test_defaults():
    s = Settings(_env_file=None)
    assert (s.host, s.port, s.mcp_path, s.max_batch_races, s.log_level) == ("127.0.0.1", 8765, "/mcp", 500, "info")
    assert s.allowed_origins == ["http://localhost:5173", "http://127.0.0.1:5173"]
    assert (s.typesafe_api_key, s.typesafe_model, s.typesafe_base_url) == (None, "jev-latest", None)
    assert (s.typesafe_timeout, s.max_concurrency) == (10.0, 4)


def test_typesafe_settings(monkeypatch):
    monkeypatch.setenv("TYPESAFE_API_KEY", " sk-123 ")
    monkeypatch.setenv("JEV_TYPESAFE_MODEL", "jev-1.13.0")
    monkeypatch.setenv("JEV_TYPESAFE_BASE_URL", "https://proxy.example.com/")
    s = Settings(_env_file=None)
    assert s.typesafe_api_key.get_secret_value() == "sk-123"
    assert "sk-123" not in repr(s)
    assert (s.typesafe_model, s.typesafe_base_url) == ("jev-1.13.0", "https://proxy.example.com")


def test_empty_key_is_unset(monkeypatch):
    monkeypatch.setenv("TYPESAFE_API_KEY", "")
    assert Settings(_env_file=None).typesafe_api_key is None


def test_env_overrides(monkeypatch):
    monkeypatch.setenv("JEV_PORT", "9000")
    monkeypatch.setenv("JEV_ALLOWED_ORIGINS", "https://a.example.com/, http://localhost:3000")
    monkeypatch.setenv("JEV_LOG_LEVEL", "DEBUG")
    s = Settings(_env_file=None)
    assert s.port == 9000
    assert s.allowed_origins == ["https://a.example.com", "http://localhost:3000"]
    assert s.log_level == "debug"


def test_env_file(tmp_path):
    env = tmp_path / ".env"
    env.write_text("JEV_PORT=8800\nJEV_MAX_BATCH_RACES=100\n")
    s = Settings(_env_file=env)
    assert (s.port, s.max_batch_races) == (8800, 100)


@pytest.mark.parametrize(
    "key,value",
    [
        ("JEV_PORT", "0"),
        ("JEV_PORT", "abc"),
        ("JEV_MCP_PATH", "mcp"),
        ("JEV_ALLOWED_ORIGINS", "localhost:5173"),
        ("JEV_MAX_BATCH_RACES", "0"),
        ("JEV_LOG_LEVEL", "verbose"),
        ("JEV_TYPESAFE_TIMEOUT", "0"),
        ("JEV_MAX_CONCURRENCY", "0"),
        ("JEV_TYPESAFE_BASE_URL", "api.typesafe.ai"),
    ],
)
def test_invalid_env(monkeypatch, key, value):
    monkeypatch.setenv(key, value)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)
