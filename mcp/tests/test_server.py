import asyncio

import pytest
from fastmcp import Client
from fastmcp.exceptions import ToolError
from starlette.testclient import TestClient

from conftest import HORSES
from jev_agent.config import Settings
from jev_agent.main import create_app
from jev_agent.server import create_mcp

LIVE = {
    "elapsed": 30,
    "horses": [
        {"name": "A", "status": "running", "distance_run": 500},
        {"name": "B", "status": "running", "distance_run": 520, "events": [{"type": "stumble", "at_s": 20.5, "at_m": 300}]},
    ],
}


@pytest.fixture
def mcp(settings, provider):
    return create_mcp(settings, provider)


def call(mcp, tool, args):
    async def go():
        async with Client(mcp) as c:
            return await c.call_tool(tool, args)

    return asyncio.run(go())


def test_tools_listed(mcp):
    async def go():
        async with Client(mcp) as c:
            return {t.name: t for t in await c.list_tools()}

    tools = asyncio.run(go())
    assert {"predict_race", "predict_races"} <= set(tools)
    assert tools["predict_race"].output_schema is not None


def test_predict_race_pre(mcp, fake_api):
    out = call(mcp, "predict_race", {"weather": "sunny", "distance": 1200, "horses": HORSES}).structured_content
    assert out["phase"] == "pre_race"
    assert out["favorite"] == "A"
    assert out["model"] == "jev-test"
    assert abs(sum(out["probabilities"].values()) - 1) < 1e-12
    assert "live" not in fake_api.requests[0]["body"]["state"]


def test_predict_race_live(mcp, fake_api):
    args = {"weather": "rain", "distance": 1200, "horses": HORSES, "rules": ["Mud is hard."], "snapshot": LIVE}
    out = call(mcp, "predict_race", args).structured_content
    assert out["phase"] == "live"
    state = fake_api.requests[0]["body"]["state"]
    assert state["rules"] == ["Mud is hard."]
    assert [i["incident"] for i in state["live"]["standings"][0]["incidents"]] == ["stumbled"]


def test_predict_races_keeps_order(mcp):
    races = [
        {"weather": "mud", "distance": 800, "horses": HORSES},
        {"weather": "hot", "distance": 2400, "horses": HORSES[::-1], "snapshot": LIVE},
    ]
    preds = call(mcp, "predict_races", {"races": races}).structured_content["predictions"]
    assert [p["phase"] for p in preds] == ["pre_race", "live"]
    assert list(preds[1]["probabilities"]) == ["B", "A"]


@pytest.mark.parametrize(
    "args",
    [
        {"weather": "snow", "distance": 1200, "horses": HORSES},
        {"weather": "sunny", "distance": -5, "horses": HORSES},
        {"weather": "sunny", "distance": 1200, "horses": HORSES[:1]},
        {"weather": "sunny", "distance": 1200, "horses": [HORSES[0], HORSES[0]]},
        {"weather": "sunny", "distance": 1200, "horses": [{**HORSES[0], "strength": 150}, HORSES[1]]},
        {"weather": "sunny", "distance": 1200, "horses": HORSES, "snapshot": {**LIVE, "horses": LIVE["horses"][:1]}},
        {
            "weather": "sunny",
            "distance": 400,
            "horses": HORSES,
            "snapshot": LIVE,
        },
        {
            "weather": "sunny",
            "distance": 1200,
            "horses": HORSES,
            "snapshot": {**LIVE, "horses": [{**LIVE["horses"][0], "name": "Z"}, LIVE["horses"][1]]},
        },
    ],
)
def test_predict_race_rejects_invalid_input(mcp, fake_api, args):
    with pytest.raises(ToolError):
        call(mcp, "predict_race", args)
    assert fake_api.requests == []


def test_batch_limit_from_settings(mcp):
    race = {"weather": "sunny", "distance": 1200, "horses": HORSES}
    with pytest.raises(ToolError):
        call(mcp, "predict_races", {"races": [race] * 4})


def test_missing_key_is_a_tool_error():
    mcp = create_mcp(Settings(_env_file=None, typesafe_api_key=None))
    with pytest.raises(ToolError, match="TYPESAFE_API_KEY"):
        call(mcp, "predict_race", {"weather": "sunny", "distance": 1200, "horses": HORSES})


def test_api_error_is_a_tool_error(mcp, fake_api):
    fake_api.status = 500
    with pytest.raises(ToolError, match="Jev call failed"):
        call(mcp, "predict_race", {"weather": "sunny", "distance": 1200, "horses": HORSES})


def test_health_route(settings, provider):
    with TestClient(create_app(settings)) as client:
        r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "agent": "Jev", "model": "jev-test", "configured": True}
