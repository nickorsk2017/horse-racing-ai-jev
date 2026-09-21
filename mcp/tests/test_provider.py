import asyncio
import math

import httpx2
import pytest

from conftest import HORSES
from jev_agent.config import Settings
from jev_agent.providers import JevProvider, ProviderUnavailable
from jev_agent.providers.jev import normalize
from jev_agent.providers.state import build_state
from jev_agent.schemas import RaceQuery

RULES = ["Lameness is a severe handicap: a lame horse rarely wins."]


def query(**kw):
    return RaceQuery.model_validate({"weather": "mud", "distance": 2000, "horses": HORSES, "rules": RULES, **kw})


def snapshot(**kw):
    return {
        "elapsed": 61.3,
        "horses": [
            {
                "name": "A",
                "status": "running",
                "distance_run": 1200,
                "speed_mps": 20,
                "events": [{"type": "bad_start", "at_s": 0, "at_m": 0}],
            },
            {"name": "B", "status": "running", "distance_run": 1250.4, "speed_mps": 15, "events": []},
        ],
        **kw,
    }


def test_pre_race_state():
    s = build_state(query())
    assert s["race"] == {"weather": "mud", "distance_m": 2000, "phase": "before the start"}
    assert s["rules"] == RULES
    assert s["horses"][0]["diseases"] == ["healthy"]
    assert "live" not in s


def test_live_state_standings():
    s = build_state(query(snapshot=snapshot()))
    live = s["live"]
    assert s["race"]["phase"] == "in progress"
    assert live["leader_progress_pct"] == 63
    first, second = live["standings"]
    assert (first["name"], first["position"], first["behind_leader_m"], first["remaining_m"]) == ("B", 1, 0.0, 750)
    assert (second["name"], second["behind_leader_m"]) == ("A", 50.4)
    assert second["incidents"] == [{"incident": "bad start", "at_s": 0.0, "at_m": 0, "seconds_ago": 61.3}]


def test_live_state_pace():
    live = build_state(query(snapshot=snapshot()))["live"]
    leader, chaser = live["standings"]
    assert (leader["speed_m_s"], leader["eta_s"]) == (15, 49.97)
    assert "gaining_on_leader_m_s" not in leader
    assert (chaser["speed_m_s"], chaser["eta_s"], chaser["gaining_on_leader_m_s"]) == (20, 40.0, 5)
    assert live["order_at_current_pace"] == ["A", "B"]


def test_live_state_without_pace():
    snap = snapshot(horses=[{"name": "A", "status": "running", "distance_run": 0}, {"name": "B", "status": "running", "distance_run": 0}])
    live = build_state(query(snapshot=snap))["live"]
    assert all("speed_m_s" not in r and "eta_s" not in r for r in live["standings"])
    assert "order_at_current_pace" not in live


def test_live_state_finished_and_fallen():
    snap = {
        "elapsed": 120,
        "horses": [
            {"name": "A", "status": "fell", "distance_run": 900},
            {"name": "B", "status": "finished", "distance_run": 2000, "place": 1},
        ],
    }
    standings = build_state(query(snapshot=snap))["live"]["standings"]
    assert standings[0] == {"position": 1, "name": "B", "status": "finished", "finish_place": 1, "incidents": []}
    assert standings[1]["status"] == "fell" and standings[1]["fell_at_m"] == 900


def test_normalize_fills_missing_and_sums_to_one():
    out = normalize(["A", "B", "C"], {"A": 0.5, "B": 0.3})
    assert list(out) == ["A", "B", "C"]
    assert out["C"] == 0
    assert math.isclose(sum(out.values()), 1.0, abs_tol=1e-12)


def test_normalize_rejects_empty():
    with pytest.raises(ProviderUnavailable):
        normalize(["A", "B"], {})


def test_request_wire_format(provider, fake_api):
    ans = asyncio.run(provider.predict(query(snapshot=snapshot())))
    req = fake_api.requests[0]
    assert req["url"].endswith("/v1/systemone")
    assert req["headers"]["authorization"] == "Bearer test-key"
    body = req["body"]
    assert body["model"] == "jev-test"
    assert body["questions"]["winner"]["type"] == "choice"
    assert list(body["questions"]["winner"]["criteria"]) == ["A", "B"]
    assert body["state"]["live"]["standings"][0]["name"] == "B"
    assert ans.model == "jev-test" and ans.confidence == 0.8
    assert math.isclose(sum(ans.probabilities.values()), 1.0, abs_tol=1e-12)


def test_missing_key_is_reported():
    p = JevProvider(Settings(_env_file=None, typesafe_api_key=None))
    assert not p.configured
    with pytest.raises(ProviderUnavailable, match="TYPESAFE_API_KEY"):
        asyncio.run(p.predict(query()))


def test_api_error_is_reported(settings, fake_api):
    fake_api.status = 401
    p = JevProvider(settings, transport=httpx2.MockTransport(fake_api.handler))
    with pytest.raises(ProviderUnavailable, match="Jev call failed"):
        asyncio.run(p.predict(query()))


def test_predict_many_keeps_order(provider, fake_api):
    qs = [query(), query(horses=HORSES[::-1])]
    answers = asyncio.run(provider.predict_many(qs))
    assert [list(a.probabilities) for a in answers] == [["A", "B"], ["B", "A"]]
    assert len(fake_api.requests) == 2
