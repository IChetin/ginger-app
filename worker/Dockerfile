FROM python:3.12-slim

WORKDIR /app

RUN useradd --create-home --uid 1000 appuser

COPY --from=ghcr.io/astral-sh/uv:0.11.29 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY worker ./worker

USER appuser

CMD ["python", "-m", "worker.main"]
