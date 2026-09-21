"""Entry point: ASGI app (streamable HTTP, stateless, JSON responses) and uvicorn runner."""

import uvicorn
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware

from jev_agent.config import Settings, get_settings
from jev_agent.server import create_mcp


def create_app(settings: Settings | None = None):
    settings = settings or get_settings()
    mcp = create_mcp(settings)
    return mcp.http_app(
        path=settings.mcp_path,
        stateless_http=True,
        json_response=True,
        middleware=[
            Middleware(
                CORSMiddleware,
                allow_origins=settings.allowed_origins,
                allow_methods=["GET", "POST", "OPTIONS"],
                allow_headers=["*"],
                expose_headers=["mcp-session-id"],
            )
        ],
    )


def run() -> None:
    settings = get_settings()
    uvicorn.run(create_app(settings), host=settings.host, port=settings.port, log_level=settings.log_level)


if __name__ == "__main__":
    run()
