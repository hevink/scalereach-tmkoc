# Base image with system deps (cached layer)
FROM oven/bun:1-debian AS base

# Install all system dependencies in one layer (this gets cached)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ffmpeg \
    ca-certificates \
    curl \
    build-essential \
    && pip3 install yt-dlp --break-system-packages \
    && apt-get purge -y build-essential \
    && apt-get autoremove -y \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /root/.cache

# Dependencies stage (cached when package.json unchanged)
FROM base AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Final stage
FROM base AS runner
WORKDIR /app

# Create non-root user
RUN useradd -m -u 1001 appuser

# Copy deps from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source (this layer changes most often, so it's last)
COPY package.json ./
COPY src ./src
COPY drizzle ./drizzle
COPY drizzle.config.ts tsconfig.json ./

RUN chown -R appuser:appuser /app
USER appuser

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

CMD ["bun", "run", "src/index.ts"]
