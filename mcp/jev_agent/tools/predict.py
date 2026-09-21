"""MCP tools predict_race and predict_races."""

from typing import Annotated

from fastmcp import FastMCP
from fastmcp.exceptions import ToolError
from pydantic import Field, ValidationError

from jev_agent.config import Settings
from jev_agent.providers import Answer, PredictionProvider, ProviderUnavailable
from jev_agent.schemas import BatchPrediction, Distance, Horses, LiveSnapshot, Prediction, RaceQuery, Rules, Weather

READ_ONLY = {"readOnlyHint": True, "idempotentHint": False, "openWorldHint": True}


def _prediction(query: RaceQuery, answer: Answer) -> Prediction:
    return Prediction.from_probabilities(
        answer.model,
        "pre_race" if query.snapshot is None else "live",
        answer.confidence,
        answer.probabilities,
    )


def register(mcp: FastMCP, provider: PredictionProvider, settings: Settings) -> None:
    @mcp.tool(annotations=READ_ONLY)
    async def predict_race(
        weather: Annotated[Weather, Field(description="Track weather")],
        distance: Distance,
        horses: Horses,
        rules: Rules | None = None,
        snapshot: Annotated[
            LiveSnapshot | None, Field(description="Race state now; omit for a pre-race prediction")
        ] = None,
    ) -> Prediction:
        """Ask Jev for win probabilities: pre-race without a snapshot, live with one."""
        try:
            query = RaceQuery(weather=weather, distance=distance, horses=horses, rules=rules or [], snapshot=snapshot)
        except ValidationError as err:
            raise ToolError(f"invalid query: {err}") from err
        try:
            return _prediction(query, await provider.predict(query))
        except ProviderUnavailable as err:
            raise ToolError(str(err)) from err

    @mcp.tool(annotations=READ_ONLY)
    async def predict_races(
        races: Annotated[
            list[RaceQuery],
            Field(min_length=1, max_length=settings.max_batch_races, description="Queries: briefing plus optional snapshot"),
        ],
    ) -> BatchPrediction:
        """Ask Jev for a batch of queries, results in input order."""
        try:
            answers = await provider.predict_many(races)
        except ProviderUnavailable as err:
            raise ToolError(str(err)) from err
        return BatchPrediction(model=provider.version, predictions=[_prediction(q, a) for q, a in zip(races, answers)])
