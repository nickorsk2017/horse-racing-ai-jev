"""FastMCP server: tools and the health route."""

from fastmcp import FastMCP
from starlette.requests import Request
from starlette.responses import JSONResponse

from jev_agent.config import Settings, get_settings
from jev_agent.prompts import SERVER_INSTRUCTIONS
from jev_agent.providers import JevProvider, PredictionProvider
from jev_agent.schemas import Health
from jev_agent.tools import register_tools

AGENT_NAME = "Jev"


def create_mcp(settings: Settings | None = None, provider: PredictionProvider | None = None) -> FastMCP:
    settings = settings or get_settings()
    provider = provider or JevProvider(settings)

    mcp = FastMCP(name=AGENT_NAME, instructions=SERVER_INSTRUCTIONS)
    register_tools(mcp, provider, settings)

    @mcp.custom_route("/health", methods=["GET"])
    async def health(_: Request) -> JSONResponse:
        return JSONResponse(Health(agent=AGENT_NAME, model=provider.version, configured=provider.configured).model_dump())

    return mcp
