# Build stage with native build tools
FROM oven/bun:1-debian AS builder

# Install build dependencies for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install

# Copy source code
COPY . .

# Production stage
FROM oven/bun:1-debian

# Install runtime dependencies: yt-dlp, ffmpeg, python
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    ca-certificates \
    curl \
    && pip3 install yt-dlp --break-system-packages \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/src ./src
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/tsconfig.json ./

# Create non-root user for security
RUN useradd -m -u 1001 appuser && chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Start the application
CMD ["bun", "run", "src/index.ts"]
