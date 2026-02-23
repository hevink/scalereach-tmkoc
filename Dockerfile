# Build stage with native build tools
FROM oven/bun:1-debian AS builder

# Install build dependencies for native modules (sharp)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    build-essential \
    pkg-config \
    libvips-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --no-save

# Production stage
FROM oven/bun:1-debian AS runner

# Install runtime dependencies (libvips for sharp, yt-dlp for YouTube validation)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips42 \
    ca-certificates \
    curl \
    python3 \
    python3-pip \
    && pip3 install --upgrade yt-dlp --break-system-packages \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /root/.cache

WORKDIR /app

# Create non-root user
RUN useradd -m -u 1001 appuser

# Copy node_modules from builder (includes compiled native modules)
COPY --from=builder /app/node_modules ./node_modules

# Copy source
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
