"""Contract of a prediction provider."""

from dataclasses import dataclass
from typing import Protocol

from jev_agent.schemas import RaceQuery


@dataclass(frozen=True)
class Answer:
    model: str
    confidence: float
    probabilities: dict[str, float]


class ProviderUnavailable(RuntimeError):
    """The model cannot be called: missing key, network or API error."""


class PredictionProvider(Protocol):
    version: str
    configured: bool

    async def predict(self, query: RaceQuery) -> Answer:
        """Return win probability per horse name, summing to 1."""
        ...

    async def predict_many(self, queries: list[RaceQuery]) -> list[Answer]:
        """Predict a batch, results in input order."""
        ...
