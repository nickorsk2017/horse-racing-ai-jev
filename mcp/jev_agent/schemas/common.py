"""Shared types and base models for the Jev agent schemas."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

Weather = Literal["sunny", "rain", "mud", "hot", "windy"]
Disease = Literal["cold", "lameness", "fatigue"]
LiveEvent = Literal["bad_start", "winded", "stumble", "second_wind"]
HorseStatus = Literal["running", "finished", "fell"]
Phase = Literal["pre_race", "live"]

HorseName = Annotated[str, Field(min_length=1, max_length=40, description="Horse name, unique within the race")]
Probability = Annotated[float, Field(ge=0.0, le=1.0, description="Probability, 0..1")]

MIN_FIELD = 2
MAX_FIELD = 24
MIN_DISTANCE = 100
MAX_DISTANCE = 10_000
MAX_RULES = 50
MAX_RULE_LENGTH = 500
MAX_EVENTS = 20
MAX_ELAPSED = 3600
MAX_SPEED = 40
PROBABILITY_TOLERANCE = 1e-9


class InputModel(BaseModel):
    """Base for data received from clients: unknown fields are rejected, strings are trimmed."""

    model_config = ConfigDict(extra="forbid", frozen=True, str_strip_whitespace=True)


class OutputModel(BaseModel):
    """Base for data returned to clients."""

    model_config = ConfigDict(extra="forbid", frozen=True)
