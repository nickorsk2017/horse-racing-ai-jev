"""Builds the Jev state from a query.

Jev reads the state as JSON. Numbers the model would have to compare (positions, gaps, remaining
distance, pace, time to finish) are computed here, so Jev receives ready standings instead of raw coordinates.
"""

from typing import Any

from jev_agent.schemas import LiveHorse, RaceQuery

EVENT_TEXT = {
    "bad_start": "bad start",
    "winded": "winded, slowing down",
    "stumble": "stumbled",
    "second_wind": "got a second wind",
}


def _standing_order(h: LiveHorse) -> tuple[int, float]:
    if h.status == "finished":
        return (0, float(h.place or 0))
    if h.status == "running":
        return (1, -h.distance_run)
    return (2, -h.distance_run)


def _eta(h: LiveHorse, distance: int) -> float | None:
    if h.status != "running" or not h.speed_mps:
        return None
    return (distance - h.distance_run) / h.speed_mps


def _incidents(h: LiveHorse, elapsed: float) -> list[dict[str, Any]]:
    return [
        {
            "incident": EVENT_TEXT[e.type],
            "at_s": round(e.at_s, 1),
            "at_m": round(e.at_m),
            "seconds_ago": round(max(0.0, elapsed - e.at_s), 1),
        }
        for e in h.events
    ]


def build_state(q: RaceQuery) -> dict[str, Any]:
    state: dict[str, Any] = {
        "rules": list(q.rules),
        "race": {
            "weather": q.weather,
            "distance_m": q.distance,
            "phase": "before the start" if q.snapshot is None else "in progress",
        },
        "horses": [
            {
                "name": h.name,
                "strength": h.strength,
                "stamina": h.stamina,
                "age": h.age,
                "diseases": list(h.diseases) or ["healthy"],
            }
            for h in q.horses
        ],
    }
    if q.snapshot is None:
        return state

    elapsed = q.snapshot.elapsed
    live = sorted(q.snapshot.horses, key=_standing_order)
    in_race = [h.distance_run for h in live if h.status != "fell"]
    leader = max(in_race) if in_race else 0.0
    running = [h for h in live if h.status == "running"]
    lead_runner = running[0] if running and running[0].distance_run >= leader else None
    standings = []
    for pos, h in enumerate(live, start=1):
        row: dict[str, Any] = {"position": pos, "name": h.name, "status": h.status}
        if h.status == "finished":
            row["finish_place"] = h.place
        elif h.status == "running":
            row["distance_run_m"] = round(h.distance_run)
            row["remaining_m"] = round(q.distance - h.distance_run)
            row["behind_leader_m"] = round(leader - h.distance_run, 1)
            if h.speed_mps is not None:
                row["speed_m_s"] = round(h.speed_mps, 2)
                eta = _eta(h, q.distance)
                if eta is not None:
                    row["eta_s"] = round(eta, 2)
                if lead_runner is not None and lead_runner is not h and lead_runner.speed_mps is not None:
                    row["gaining_on_leader_m_s"] = round(h.speed_mps - lead_runner.speed_mps, 2)
        else:
            row["fell_at_m"] = round(h.distance_run)
        row["incidents"] = _incidents(h, elapsed)
        standings.append(row)
    state["live"] = {
        "elapsed_s": round(elapsed, 1),
        "leader_progress_pct": round(100 * leader / q.distance),
        "standings": standings,
    }
    etas = [(e, h.name) for h in running if (e := _eta(h, q.distance)) is not None]
    if len(etas) > 1:
        state["live"]["order_at_current_pace"] = [name for _, name in sorted(etas)]
    return state
