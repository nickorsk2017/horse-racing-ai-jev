"""Input schema: a live snapshot of a race in progress and a Jev query (briefing plus optional snapshot).

The snapshot holds only what a spectator sees: distance run, observed pace, finish places, falls and visible
incidents with the time and place they happened.
Engine internals (energy, form, formula coefficients) never enter it.
"""

from typing import Annotated

from pydantic import AfterValidator, Field, model_validator

from jev_agent.schemas.briefing import RaceBriefing
from jev_agent.schemas.common import (
    MAX_DISTANCE,
    MAX_ELAPSED,
    MAX_EVENTS,
    MAX_FIELD,
    MAX_SPEED,
    MIN_FIELD,
    HorseName,
    HorseStatus,
    InputModel,
    LiveEvent,
)


class LiveIncident(InputModel):
    type: LiveEvent = Field(description="bad_start, winded, stumble or second_wind")
    at_s: float = Field(ge=0, le=MAX_ELAPSED, description="Seconds since the start when it happened")
    at_m: float = Field(ge=0, le=MAX_DISTANCE, description="Metres run when it happened")


class LiveHorse(InputModel):
    name: HorseName
    status: HorseStatus = Field(description="running, finished or fell")
    distance_run: float = Field(ge=0, le=MAX_DISTANCE, description="Metres covered so far")
    place: int | None = Field(default=None, ge=1, le=MAX_FIELD, description="Finish place, only for finished horses")
    speed_mps: float | None = Field(
        default=None, ge=0, le=MAX_SPEED, description="Observed pace over the last seconds, m/s; running horses only"
    )
    events: list[LiveIncident] = Field(
        default_factory=list, max_length=MAX_EVENTS, description="Visible incidents so far, oldest first"
    )

    @model_validator(mode="after")
    def place_matches_status(self) -> "LiveHorse":
        if (self.status == "finished") != (self.place is not None):
            raise ValueError("place is required for finished horses and only for them")
        if self.speed_mps is not None and self.status != "running":
            raise ValueError("speed_mps is only for running horses")
        return self


def _unique_live_names(horses: list[LiveHorse]) -> list[LiveHorse]:
    names = [h.name for h in horses]
    if len(names) != len(set(names)):
        raise ValueError("horse names must be unique")
    places = [h.place for h in horses if h.place is not None]
    if len(places) != len(set(places)):
        raise ValueError("finish places must be unique")
    return horses


class LiveSnapshot(InputModel):
    elapsed: float = Field(ge=0, le=MAX_ELAPSED, description="Seconds since the start")
    horses: Annotated[
        list[LiveHorse],
        Field(min_length=MIN_FIELD, max_length=MAX_FIELD),
        AfterValidator(_unique_live_names),
    ]


class RaceQuery(RaceBriefing):
    snapshot: LiveSnapshot | None = Field(default=None, description="Race state now; omit for a pre-race prediction")

    @model_validator(mode="after")
    def snapshot_matches_field(self) -> "RaceQuery":
        if self.snapshot is None:
            return self
        if {h.name for h in self.snapshot.horses} != {h.name for h in self.horses}:
            raise ValueError("snapshot horses must match the starting field")
        for h in self.snapshot.horses:
            if h.distance_run > self.distance + 1e-6:
                raise ValueError(f"{h.name}: distance_run exceeds the race distance")
            for e in h.events:
                if e.at_s > self.snapshot.elapsed + 1e-6:
                    raise ValueError(f"{h.name}: incident after the snapshot time")
                if e.at_m > self.distance + 1e-6:
                    raise ValueError(f"{h.name}: incident beyond the race distance")
        return self
