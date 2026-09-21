"""Jev by TypeSafe AI: the only prediction model of the agent.

One call per query: the state (briefing, rules, live standings) and one Choice question
"which horse wins" with the horse names as options. Jev returns a probability per option.
"""

import asyncio
import math
from collections.abc import Iterable

import httpx2
from typesafe_sdk import AsyncTypeSafeClient, Choice, RetryPolicy, TypeSafeError

from jev_agent.config import Settings
from jev_agent.prompts import WINNER_QUESTION
from jev_agent.providers.base import Answer, ProviderUnavailable
from jev_agent.providers.state import build_state
from jev_agent.schemas import RaceQuery

QUESTION = "winner"


def winner_question(q: RaceQuery) -> Choice:
    return Choice(
        instructions=WINNER_QUESTION,
        criteria={h.name: f"{h.name} crosses the finish line first" for h in q.horses},
    )


def normalize(names: Iterable[str], raw: dict[str, float]) -> dict[str, float]:
    """Probabilities for every horse in field order, summing to 1."""
    names = list(names)
    probs = {n: max(0.0, float(raw.get(n, 0.0))) for n in names}
    total = math.fsum(probs.values())
    if not math.isfinite(total) or total <= 0:
        raise ProviderUnavailable("Jev returned no usable probabilities")
    out = {n: p / total for n, p in probs.items()}
    drift = 1.0 - math.fsum(out.values())
    top = max(out, key=out.get)
    out[top] += drift
    return out


class JevProvider:
    """Jev as a PredictionProvider. The async client is created per event loop and reused."""

    def __init__(self, settings: Settings, transport: httpx2.AsyncBaseTransport | None = None) -> None:
        self._settings = settings
        self._transport = transport
        self._clients: dict[int, AsyncTypeSafeClient] = {}
        self.version = settings.typesafe_model
        self.configured = settings.typesafe_api_key is not None

    def _client(self) -> AsyncTypeSafeClient:
        if not self.configured:
            raise ProviderUnavailable("TYPESAFE_API_KEY is not set: add it to mcp/.env and restart the agent")
        loop = id(asyncio.get_running_loop())
        client = self._clients.get(loop)
        if client is None:
            key = self._settings.typesafe_api_key
            client = AsyncTypeSafeClient(
                api_key=key.get_secret_value() if key else None,
                model=self._settings.typesafe_model,
                base_url=self._settings.typesafe_base_url,
                timeout=self._settings.typesafe_timeout,
                retry=RetryPolicy(max_retries=2),
                transport=self._transport,
            )
            self._clients = {loop: client}
        return client

    async def predict(self, query: RaceQuery) -> Answer:
        client = self._client()
        try:
            res = await client.system_one(state=build_state(query), questions={QUESTION: winner_question(query)})
        except TypeSafeError as err:
            raise ProviderUnavailable(f"Jev call failed: {err}") from err
        answer = res.choices.get(QUESTION)
        if answer is None:
            raise ProviderUnavailable("Jev response has no answer to the winner question")
        return Answer(
            model=res.model,
            confidence=min(1.0, max(0.0, answer.confidence)),
            probabilities=normalize((h.name for h in query.horses), answer.probabilities),
        )

    async def predict_many(self, queries: list[RaceQuery]) -> list[Answer]:
        limit = asyncio.Semaphore(self._settings.max_concurrency)

        async def one(q: RaceQuery) -> Answer:
            async with limit:
                return await self.predict(q)

        return list(await asyncio.gather(*(one(q) for q in queries)))
