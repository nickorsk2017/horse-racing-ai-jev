import pytest
from pydantic import ValidationError

from jev_agent.schemas import BatchPrediction, Health, Horse, LiveHorse, Prediction, RaceBriefing, RaceQuery


def horse(**kw):
    return {"name": "A", "strength": 50, "stamina": 50, "age": 4, "diseases": [], **kw}


def briefing(**kw):
    return {"weather": "sunny", "distance": 1200, "horses": [horse(), horse(name="B")], **kw}


def test_valid_briefing():
    b = RaceBriefing.model_validate(briefing())
    assert [h.name for h in b.horses] == ["A", "B"]


def test_name_is_trimmed():
    assert Horse.model_validate(horse(name="  Comet ")).name == "Comet"


@pytest.mark.parametrize(
    "data",
    [
        horse(name=""),
        horse(strength=101),
        horse(stamina=-1),
        horse(age=0),
        horse(diseases=["flu"]),
        horse(diseases=["cold", "cold"]),
        horse(color="bay"),
    ],
)
def test_invalid_horse(data):
    with pytest.raises(ValidationError):
        Horse.model_validate(data)


@pytest.mark.parametrize(
    "data",
    [
        briefing(weather="snow"),
        briefing(distance=0),
        briefing(distance=50_000),
        briefing(horses=[horse()]),
        briefing(horses=[horse(), horse()]),
        briefing(seed=42),
    ],
)
def test_invalid_briefing(data):
    with pytest.raises(ValidationError):
        RaceBriefing.model_validate(data)


def test_briefing_is_immutable():
    b = RaceBriefing.model_validate(briefing())
    with pytest.raises(ValidationError):
        b.distance = 2000


def test_prediction_from_probabilities():
    p = Prediction.from_probabilities("jev-1.0", "pre_race", 0.7, {"A": 0.7, "B": 0.3})
    assert p.favorite == "A"


@pytest.mark.parametrize(
    "data",
    [
        {"model": "jev-1.0", "phase": "pre_race", "confidence": 0.7, "probabilities": {"A": 0.7, "B": 0.4}, "favorite": "A"},
        {"model": "jev-1.0", "phase": "pre_race", "confidence": 0.7, "probabilities": {"A": 1.2, "B": -0.2}, "favorite": "A"},
        {"model": "jev-1.0", "phase": "pre_race", "confidence": 0.7, "probabilities": {"A": 0.7, "B": 0.3}, "favorite": "C"},
        {"model": "jev-1.0", "phase": "pre_race", "confidence": 0.7, "probabilities": {"A": 0.7, "B": 0.3}, "favorite": "B"},
        {"model": "", "phase": "pre_race", "confidence": 0.7, "probabilities": {"A": 0.7, "B": 0.3}, "favorite": "A"},
    ],
)
def test_invalid_prediction(data):
    with pytest.raises(ValidationError):
        Prediction.model_validate(data)


def test_batch_prediction():
    p = Prediction.from_probabilities("jev-1.0", "live", 0.5, {"A": 0.5, "B": 0.5})
    assert BatchPrediction(model="jev-1.0", predictions=[p]).predictions[0].favorite in {"A", "B"}


def test_health():
    h = Health(agent="Jev", model="jev-1.0", configured=False).model_dump()
    assert h == {"status": "ok", "agent": "Jev", "model": "jev-1.0", "configured": False}


def test_briefing_rules():
    b = RaceBriefing.model_validate(briefing(rules=["Mud is the hardest surface."]))
    assert b.rules == ["Mud is the hardest surface."]
    with pytest.raises(ValidationError):
        RaceBriefing.model_validate(briefing(rules=[""]))


def live(**kw):
    return {"name": "A", "status": "running", "distance_run": 300, **kw}


@pytest.mark.parametrize(
    "data",
    [
        live(status="finished"),
        live(place=1),
        live(status="flying"),
        live(distance_run=-1),
        live(events=["winded"]),
        live(events=[{"type": "teleport", "at_s": 1, "at_m": 10}]),
        live(events=[{"type": "winded", "at_s": -1, "at_m": 10}]),
        live(status="fell", speed_mps=10),
        live(speed_mps=-1),
    ],
)
def test_invalid_live_horse(data):
    with pytest.raises(ValidationError):
        LiveHorse.model_validate(data)


def test_query_with_snapshot():
    snap = {"elapsed": 12.5, "horses": [live(), live(name="B", status="finished", distance_run=1200, place=1)]}
    q = RaceQuery.model_validate(briefing(snapshot=snap))
    assert q.snapshot.horses[1].place == 1


def test_query_rejects_duplicate_places():
    finished = live(status="finished", distance_run=1200, place=1)
    snap = {"elapsed": 50, "horses": [finished, {**finished, "name": "B"}]}
    with pytest.raises(ValidationError):
        RaceQuery.model_validate(briefing(snapshot=snap))


def test_query_rejects_incident_after_snapshot_time():
    snap = {"elapsed": 10, "horses": [live(events=[{"type": "winded", "at_s": 11, "at_m": 150}]), live(name="B")]}
    with pytest.raises(ValidationError):
        RaceQuery.model_validate(briefing(snapshot=snap))


def test_query_with_pace_and_incidents():
    snap = {"elapsed": 30, "horses": [live(speed_mps=16.4, events=[{"type": "winded", "at_s": 25, "at_m": 280}]), live(name="B")]}
    q = RaceQuery.model_validate(briefing(snapshot=snap))
    assert q.snapshot.horses[0].speed_mps == 16.4
    assert q.snapshot.horses[0].events[0].at_m == 280
