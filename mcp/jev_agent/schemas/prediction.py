"""Output schema: win probabilities returned by the agent."""

import math

from pydantic import Field, model_validator

from jev_agent.schemas.common import PROBABILITY_TOLERANCE, HorseName, OutputModel, Phase, Probability


class Prediction(OutputModel):
    model: str = Field(min_length=1, description="Model version")
    phase: Phase = Field(description="pre_race: from the briefing, live: from the briefing and a race snapshot")
    confidence: Probability = Field(description="Jev confidence in the favorite, 0..1")
    probabilities: dict[HorseName, Probability] = Field(
        min_length=2, description="Win probability per horse name, sums to 1"
    )
    favorite: HorseName = Field(description="Horse with the highest win probability")

    @model_validator(mode="after")
    def check_distribution(self) -> "Prediction":
        total = math.fsum(self.probabilities.values())
        if not math.isclose(total, 1.0, abs_tol=PROBABILITY_TOLERANCE):
            raise ValueError(f"probabilities must sum to 1, got {total}")
        if self.favorite not in self.probabilities:
            raise ValueError("favorite must be one of the horses")
        if self.probabilities[self.favorite] < max(self.probabilities.values()):
            raise ValueError("favorite must have the highest probability")
        return self

    @classmethod
    def from_probabilities(
        cls, model: str, phase: str, confidence: float, probabilities: dict[str, float]
    ) -> "Prediction":
        return cls(
            model=model,
            phase=phase,
            confidence=confidence,
            probabilities=probabilities,
            favorite=max(probabilities, key=probabilities.get),
        )


class BatchPrediction(OutputModel):
    model: str = Field(min_length=1, description="Model version")
    predictions: list[Prediction] = Field(description="Predictions in input order")
