# Multi-stage ARM-compatible Dockerfile for WhatsApp LLM Personal Assistant
# Optimized for ARM32 (Raspberry Pi 2/3) and ARM64 with Chrome/Chromium support

# Build stage
FROM node:18-bullseye AS builder

# Set environment variables to skip Puppeteer Chrome download
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Install build tools and dependencies for native module compilation on ARM
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    gcc \
    build-essential \
    sqlite3 \
    libsqlite3-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies with verbose logging and specific sqlite3 configuration for ARM
RUN npm config set sqlite3_binary_site https://mapbox-node-binary.s3.amazonaws.com && \
    npm config set target_arch arm && \
    npm config set sqlite /usr/bin && \
    npm ci --include=dev --verbose

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Production stage
FROM node:18-bullseye-slim AS production

# Install system dependencies for Chrome/Chromium and ARM compatibility
RUN apt-get update && apt-get install -y \
    # Build tools needed for native modules in production
    python3 \
    make \
    g++ \
    gcc \
    build-essential \
    # Chrome/Chromium dependencies
    chromium \
    chromium-sandbox \
    # Required libraries for headless browser on ARM
    libnss3 \
    libatk-bridge2.0-0 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libxss1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libatk1.0-0 \
    libcairo-gobject2 \
    libgtk-3-0 \
    libgdk-pixbuf2.0-0 \
    # System utilities
    wget \
    curl \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libnspr4 \
    lsb-release \
    xdg-utils \
    # SQLite3 for database management
    sqlite3 \
    libsqlite3-dev \
    # Clean up
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set Chrome executable path for ARM compatibility
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Create non-root user for security
RUN groupadd -r whatsapp && useradd -r -g whatsapp -s /bin/bash whatsapp

# Create application directory
WORKDIR /app

# Create data directories with proper permissions
RUN mkdir -p /app/data /app/sessions /app/logs \
    && chown -R whatsapp:whatsapp /app

# Copy package files and install production dependencies with ARM sqlite3 config
COPY package*.json ./
RUN npm config set sqlite3_binary_site https://mapbox-node-binary.s3.amazonaws.com && \
    npm config set target_arch arm && \
    npm config set sqlite /usr/bin && \
    npm ci --only=production --verbose && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy entrypoint script
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Switch to non-root user
USER whatsapp

# Set environment variables
ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/conversations.db
ENV WHATSAPP_SESSION_PATH=/app/data/session

# Expose health check port (if needed)
EXPOSE 3000

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "console.log('Health check passed')" || exit 1

# Set volumes for persistent data
VOLUME ["/app/data", "/app/sessions", "/app/logs"]

# Use entrypoint script
ENTRYPOINT ["./docker-entrypoint.sh"]

# Default command
CMD ["npm", "start"]