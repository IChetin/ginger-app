FROM python:3.12-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 appuser

COPY --from=ghcr.io/astral-sh/uv:0.11.29 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

COPY pyproject.toml uv.lock alembic.ini ./
RUN uv sync --frozen --no-dev --no-install-project

COPY app ./app

# Скриншоты оплаты пишутся в том /data/uploads: пустой том берёт владельца из образа,
# иначе бэкенд под appuser получает Permission denied и заявка падает с 500.
RUN mkdir -p /data/uploads && chown -R appuser:appuser /data

USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
