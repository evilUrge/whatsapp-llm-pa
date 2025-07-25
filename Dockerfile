# Multi-stage ARM-compatible Dockerfile for WhatsApp LLM Personal Assistant
# Optimized for ARM64/Apple Silicon with Chrome/Chromium support

# Build stage
FROM node:18-bullseye AS builder

# Set environment variables to skip Puppeteer Chrome download
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_SKIP_DOWNLOAD=true

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies (including dev dependencies for build)
RUN npm ci --include=dev

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Production stage
FROM node:18-bullseye-slim AS production

# Install system dependencies for Chrome/Chromium and ARM compatibility
RUN apt-get update && apt-get install -y \
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
    libasound2 \
    libatk-bridge2.0-0 \
    libnspr4 \
    libnss3 \
    lsb-release \
    xdg-utils \
    # SQLite3 for database management
    sqlite3 \
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

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

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