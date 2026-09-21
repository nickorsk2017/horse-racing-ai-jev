# Jev AI Agent

MCP server (FastMCP, streamable HTTP) that calls Jev (TypeSafe AI, `typesafe-sdk`) for win probabilities, pre-race and live.

## Layout

- `jev_agent/config.py`: `Settings` (pydantic-settings). All configuration comes from `JEV_*` env vars, `TYPESAFE_API_KEY` or `.env`. Never read `os.environ` elsewhere.
- `jev_agent/main.py`: ASGI app (`create_app`) and uvicorn entry point (`run`). CORS lives here.
- `jev_agent/server.py`: `create_mcp` builds FastMCP, registers tools and the `/health` route.
- `jev_agent/schemas/`: Pydantic models for all input and output. Input models forbid unknown fields and are frozen.
- `jev_agent/schemas/live.py`: `LiveSnapshot` and `RaceQuery` (briefing plus optional snapshot).
- `jev_agent/providers/`: `jev.py` is the only provider (`PredictionProvider`: `version`, `configured`, async `predict`, `predict_many`). `state.py` builds the Jev state.
- `jev_agent/tools/`: MCP tools. A tool validates input through schemas, calls a provider, returns a schema model.
- `jev_agent/prompts/`: server instructions and the Jev winner question.

## Rules

- Jev is the only prediction model. No hand-written formula or fallback provider.
- Jev sees only what a spectator knows: the public briefing (weather, distance, horses, rules text) and the live snapshot (distance run, observed pace, places, falls, visible incidents with time and place). Engine internals (formula, energy, form, seeds) and the result never enter the agent.
- Numbers Jev would have to compare (positions, gaps, remaining distance, pace, time to finish) are computed in `providers/state.py`, not left to the model.
- The API key lives only in `Settings.typesafe_api_key` (`SecretStr`). Never log it, never read `os.environ` elsewhere.
- Tests never call the real API: use `FakeTypeSafe` from `tests/conftest.py`.
- Tools return Pydantic models so FastMCP publishes an output schema. Provider errors become `ToolError`.
- New settings: add a field to `Settings`, a line to `.env.example`, a row to the README table.
- New tool: module in `tools/`, register it in `tools/__init__.py`, add tests in `tests/test_server.py`.

## Commands

```
./run.sh
.venv/bin/python -m pytest -q
docker build -t jev-agent .
docker run --rm -p 8765:8765 --env-file .env -e JEV_HOST=0.0.0.0 jev-agent
```
