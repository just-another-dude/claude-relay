FROM node:18-bookworm-slim

# Chromium runtime deps, Python, tmux
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip tmux ca-certificates fonts-liberation \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libcairo2 libcups2 \
    libdbus-1-3 libdrm2 libgbm1 libglib2.0-0 libgtk-3-0 libnspr4 \
    libnss3 libpango-1.0-0 libx11-6 libx11-xcb1 libxcb1 \
    libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 \
    libxshmfence1 xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Non-root user
RUN groupadd -r relay && useradd -r -g relay -m -d /home/relay -s /bin/bash relay

# Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app

# Node deps (Puppeteer downloads Chrome here)
COPY package.json package-lock.json* ./
ENV PUPPETEER_CACHE_DIR=/home/relay/.cache/puppeteer
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi \
    && chown -R relay:relay /home/relay/.cache

# Python runtime dep only (not dev deps)
RUN pip3 install --no-cache-dir --break-system-packages "anthropic>=0.18.0"

# App source
COPY src/ ./src/
COPY .env.example ./

# Persistent data dirs
RUN mkdir -p /app/logs /app/data /app/.wwebjs_auth /home/relay/claude-workspace \
    && chown -R relay:relay /app /home/relay

ENV NODE_ENV=production
ENV SUPERVISOR_HISTORY_PATH=/app/data/supervisor-history.json
ENV CLAUDE_WORKSPACE=/home/relay/claude-workspace

USER relay

HEALTHCHECK --interval=60s --timeout=10s --retries=3 \
    CMD pgrep -f "node src/whatsapp.js" > /dev/null || exit 1

ENTRYPOINT ["node", "src/whatsapp.js"]
