"""Input schema: the public race briefing, without engine internals."""

from typing import Annotated

from pydantic import AfterValidator, Field, field_validator

from jev_agent.schemas.common import (
    MAX_DISTANCE,
    MAX_FIELD,
    MAX_RULE_LENGTH,
    MAX_RULES,
    MIN_DISTANCE,
    MIN_FIELD,
    Disease,
    HorseName,
    InputModel,
    Weather,
)

Attribute = Annotated[float, Field(ge=0, le=100)]


class Horse(InputModel):
    name: HorseName
    strength: Attribute = Field(description="Strength attribute, 0..100")
    stamina: Attribute = Field(description="Stamina attribute, 0..100")
    age: int = Field(ge=1, le=30, description="Age in years")
    diseases: list[Disease] = Field(default_factory=list, max_length=3, description="Active diseases")

    @field_validator("diseases")
    @classmethod
    def unique_diseases(cls, diseases: list[Disease]) -> list[Disease]:
        if len(diseases) != len(set(diseases)):
            raise ValueError("diseases must be unique")
        return diseases


Distance = Annotated[
    int,
    Field(ge=MIN_DISTANCE, le=MAX_DISTANCE, description=f"Race distance in metres, {MIN_DISTANCE}..{MAX_DISTANCE}"),
]


def _unique_names(horses: list[Horse]) -> list[Horse]:
    names = [h.name for h in horses]
    if len(names) != len(set(names)):
        raise ValueError("horse names must be unique")
    return horses


Horses = Annotated[
    list[Horse],
    Field(min_length=MIN_FIELD, max_length=MAX_FIELD, description="Starting field, horse names unique"),
    AfterValidator(_unique_names),
]


Rule = Annotated[str, Field(min_length=1, max_length=MAX_RULE_LENGTH)]
Rules = Annotated[
    list[Rule],
    Field(max_length=MAX_RULES, description="Public race rules in plain text, as a spectator knows them"),
]


class RaceBriefing(InputModel):
    weather: Weather = Field(description="Track weather")
    distance: Distance
    horses: Horses
    rules: Rules = Field(default_factory=list)

