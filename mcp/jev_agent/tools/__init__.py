"""MCP tools of the agent."""

from fastmcp import FastMCP

from jev_agent.config import Settings
from jev_agent.providers import PredictionProvider
from jev_agent.tools import predict


def register_tools(mcp: FastMCP, provider: PredictionProvider, settings: Settings) -> None:
    predict.register(mcp, provider, settings)


__all__ = ["register_tools"]
