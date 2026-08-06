# ── Stage 1: build the web UI ──
FROM node:22-alpine AS web

WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig*.json vite.config.ts index.html ./
COPY src ./src
RUN npm run build


# ── Stage 2: runtime ──
FROM python:3.12-slim

# 依存の取得以外に root は不要なので、非 root ユーザーで動かす
RUN useradd --create-home --uid 10001 vertexscope

WORKDIR /app

COPY server/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY server/ ./
COPY --from=web /build/dist ./static

# 設定ファイルの置き場（compose では named volume をマウントする）
ENV VERTEXSCOPE_CONFIG_DIR=/data \
    VERTEXSCOPE_HOST=0.0.0.0 \
    VERTEXSCOPE_PORT=8765 \
    PYTHONUNBUFFERED=1
RUN mkdir -p /data && chown vertexscope:vertexscope /data

USER vertexscope
EXPOSE 8765

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8765/healthz', timeout=3).status == 200 else 1)"

CMD ["python", "main.py"]
