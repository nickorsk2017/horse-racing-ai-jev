"""Health check response."""

from typing import Literal

from jev_agent.schemas.common import OutputModel


class Health(OutputModel):
    status: Literal["ok"] = "ok"
    agent: str
    model: str
    configured: bool
