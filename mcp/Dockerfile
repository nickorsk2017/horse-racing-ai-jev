FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    JEV_HOST=0.0.0.0 \
    JEV_PORT=8765

WORKDIR /app

COPY pyproject.toml ./
COPY jev_agent ./jev_agent


FROM base AS test

RUN pip install --no-cache-dir ".[dev]"
COPY tests ./tests
CMD ["python", "-m", "pytest", "-q", "-p", "no:cacheprovider"]


FROM base AS runtime

RUN pip install --no-cache-dir . && useradd --create-home --uid 1000 jev

USER jev
EXPOSE 8765

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"JEV_PORT\"]}/health', timeout=2)"

CMD ["jev-agent"]
