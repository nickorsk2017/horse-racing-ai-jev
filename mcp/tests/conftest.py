import json
import sys
from pathlib import Path

import httpx2
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from jev_agent.config import Settings  # noqa: E402
from jev_agent.providers import JevProvider  # noqa: E402

HORSES = [
    {"name": "A", "strength": 70, "stamina": 60, "age": 4, "diseases": []},
    {"name": "B", "strength": 55, "stamina": 80, "age": 9, "diseases": ["lameness"]},
]


class FakeTypeSafe:
    """TypeSafe API stand-in: records requests, answers the winner question."""

    def __init__(self):
        self.requests: list[dict] = []
        self.status = 200
        self.probabilities: dict[str, float] | None = None

    def handler(self, request: httpx2.Request) -> httpx2.Response:
        body = json.loads(request.content)
        self.requests.append({"url": str(request.url), "headers": dict(request.headers), "body": body})
        if self.status != 200:
            return httpx2.Response(self.status, json={"error": {"message": "denied"}})
        names = list(body["questions"]["winner"]["criteria"])
        probs = self.probabilities or {n: (len(names) - i) for i, n in enumerate(names)}
        total = sum(probs.values())
        probs = {n: p / total for n, p in probs.items()}
        top = max(probs, key=probs.get)
        return httpx2.Response(
            200,
            json={
                "model": "jev-test",
                "usage": {"input_tokens": 120, "output_tokens": 1},
                "answers": {"winner": {"type": "choice", "choice": top, "confidence": 0.8, "probabilities": probs}},
            },
        )


@pytest.fixture
def fake_api():
    return FakeTypeSafe()


@pytest.fixture
def settings():
    return Settings(_env_file=None, max_batch_races=3, typesafe_api_key="test-key", typesafe_model="jev-test")


@pytest.fixture
def provider(settings, fake_api):
    return JevProvider(settings, transport=httpx2.MockTransport(fake_api.handler))
