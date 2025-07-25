#!/bin/bash
set -e

# Docker entrypoint script for WhatsApp LLM Personal Assistant
# Handles initialization, permissions, and startup

# Color codes for logging
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_debug() {
    if [ "${DEBUG:-false}" = "true" ]; then
        echo -e "${BLUE}[DEBUG]${NC} $1"
    fi
}

# Function to wait for a condition with timeout
wait_for_condition() {
    local condition="$1"
    local timeout="${2:-30}"
    local message="$3"

    log_info "${message:-Waiting for condition...}"

    local count=0
    while [ $count -lt $timeout ]; do
        if eval "$condition"; then
            return 0
        fi
        sleep 1
        count=$((count + 1))
    done

    log_error "Timeout waiting for condition: $condition"
    return 1
}

# Initialize directory structure and permissions
initialize_directories() {
    log_info "Initializing directory structure..."

    # Create necessary directories
    mkdir -p /app/data /app/sessions /app/logs

    # Set proper permissions (already non-root user, but ensure write access)
    chmod 755 /app/data /app/sessions /app/logs

    # Create subdirectories if they don't exist
    mkdir -p /app/data/session
    mkdir -p /app/logs/application

    log_info "Directory structure initialized"
}

# Initialize database
initialize_database() {
    log_info "Checking database initialization..."

    # Check if database exists and is accessible
    if [ ! -f "${DATABASE_PATH}" ]; then
        log_info "Database file does not exist, will be created on first run"
        # Touch the file to ensure directory permissions are correct
        touch "${DATABASE_PATH}" 2>/dev/null || {
            log_error "Cannot create database file at ${DATABASE_PATH}"
            return 1
        }
        rm -f "${DATABASE_PATH}" # Remove the empty file, let the app create it properly
    else
        log_info "Database file exists at ${DATABASE_PATH}"
        # Verify database is accessible
        if command -v sqlite3 >/dev/null 2>&1; then
            sqlite3 "${DATABASE_PATH}" "SELECT 1;" >/dev/null 2>&1 || {
                log_warn "Database file exists but may be corrupted"
            }
        fi
    fi
}

# Check Chrome/Chromium installation
check_chrome() {
    log_info "Checking Chrome/Chromium installation..."

    if [ -n "${PUPPETEER_EXECUTABLE_PATH}" ]; then
        if [ -x "${PUPPETEER_EXECUTABLE_PATH}" ]; then
            log_info "Chrome/Chromium found at ${PUPPETEER_EXECUTABLE_PATH}"

            # Test Chrome version for ARM compatibility
            local chrome_version
            chrome_version=$("${PUPPETEER_EXECUTABLE_PATH}" --version 2>/dev/null || echo "unknown")
            log_info "Chrome version: ${chrome_version}"
        else
            log_error "Chrome/Chromium not found or not executable at ${PUPPETEER_EXECUTABLE_PATH}"
            return 1
        fi
    else
        log_warn "PUPPETEER_EXECUTABLE_PATH not set"
    fi

    # Check for required Chrome dependencies
    local missing_deps=()
    for dep in libnss3 libatk-bridge2.0-0 libx11-xcb1; do
        if ! dpkg -l | grep -q "^ii  $dep "; then
            missing_deps+=("$dep")
        fi
    done

    if [ ${#missing_deps[@]} -gt 0 ]; then
        log_warn "Missing Chrome dependencies: ${missing_deps[*]}"
    else
        log_info "Chrome dependencies check passed"
    fi
}

# Validate environment variables
validate_environment() {
    log_info "Validating environment configuration..."

    # Check required environment variables
    local required_vars=("CLOUDFLARE_API_TOKEN" "CLOUDFLARE_ACCOUNT_ID")
    local missing_vars=()

    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            missing_vars+=("$var")
        fi
    done

    if [ ${#missing_vars[@]} -gt 0 ]; then
        log_error "Missing required environment variables: ${missing_vars[*]}"
        log_error "Please set the following environment variables:"
        for var in "${missing_vars[@]}"; do
            log_error "  - $var"
        done
        return 1
    fi

    # Validate numeric environment variables
    local numeric_vars=(
        "RESPONSE_DELAY_MS:1000:600000"
        "COOLDOWN_PERIOD_MS:60000:86400000"
        "MAX_CONTEXT_MESSAGES:1:50"
        "RATE_LIMIT_PER_MINUTE:1:100"
        "RETRY_ATTEMPTS:1:10"
    )

    for var_config in "${numeric_vars[@]}"; do
        IFS=':' read -r var_name min_val max_val <<< "$var_config"
        local var_value="${!var_name}"

        if [ -n "$var_value" ]; then
            if ! [[ "$var_value" =~ ^[0-9]+$ ]] || [ "$var_value" -lt "$min_val" ] || [ "$var_value" -gt "$max_val" ]; then
                log_error "Invalid value for $var_name: $var_value (must be between $min_val and $max_val)"
                return 1
            fi
        fi
    done

    log_info "Environment validation passed"
}

# Display configuration
display_startup_info() {
    log_info "=== WhatsApp LLM Personal Assistant Startup ==="
    log_info "Node.js version: $(node --version)"
    log_info "Environment: ${NODE_ENV:-development}"
    log_info "AI Model: ${AI_MODEL_NAME:-@cf/meta/llama-3.2-1b-instruct}"
    log_info "Secretary Mode: ${SECRETARY_MODE:-true}"
    log_info "Response Delay: ${RESPONSE_DELAY_MS:-120000}ms"
    log_info "Database Path: ${DATABASE_PATH:-./data/conversations.db}"
    log_info "Session Path: ${WHATSAPP_SESSION_PATH:-./data/session}"

    if [ "${DEBUG:-false}" = "true" ]; then
        log_debug "Debug mode enabled"
        log_debug "Chrome executable: ${PUPPETEER_EXECUTABLE_PATH:-not set}"
        log_debug "Available system memory: $(free -h | awk '/^Mem/ {print $7}' 2>/dev/null || echo 'unknown')"
        log_debug "Available disk space: $(df -h /app/data | awk 'NR==2 {print $4}' 2>/dev/null || echo 'unknown')"
    fi

    log_info "================================================"
}

# Health check function
health_check() {
    log_info "Performing startup health check..."

    # Check if Node.js can run
    if ! node -e "console.log('Node.js is working')" >/dev/null 2>&1; then
        log_error "Node.js health check failed"
        return 1
    fi

    # Check if application files exist
    if [ ! -f "/app/dist/main.js" ]; then
        log_error "Application main file not found at /app/dist/main.js"
        return 1
    fi

    # Check write permissions
    if ! touch /app/data/.write_test 2>/dev/null; then
        log_error "Cannot write to data directory"
        return 1
    fi
    rm -f /app/data/.write_test

    log_info "Health check passed"
}

# Cleanup function for graceful shutdown
cleanup() {
    log_info "Received shutdown signal, cleaning up..."

    # Kill the main process if it's running
    if [ -n "$MAIN_PID" ]; then
        log_info "Stopping main application process..."
        kill -TERM "$MAIN_PID" 2>/dev/null || true

        # Wait for graceful shutdown
        local count=0
        while [ $count -lt 10 ] && kill -0 "$MAIN_PID" 2>/dev/null; do
            sleep 1
            count=$((count + 1))
        done

        # Force kill if still running
        if kill -0 "$MAIN_PID" 2>/dev/null; then
            log_warn "Force killing main process"
            kill -KILL "$MAIN_PID" 2>/dev/null || true
        fi
    fi

    log_info "Cleanup completed"
    exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT

# Main execution
main() {
    log_info "Starting WhatsApp LLM Personal Assistant container..."

    # Initialize directories and permissions
    initialize_directories || exit 1

    # Validate environment
    validate_environment || exit 1

    # Initialize database
    initialize_database || exit 1

    # Check Chrome installation
    check_chrome || exit 1

    # Perform health check
    health_check || exit 1

    # Display startup information
    display_startup_info

    # If no arguments provided, run the default command
    if [ $# -eq 0 ]; then
        log_info "Starting application with default command: npm start"
        exec npm start
    else
        # Execute the provided command
        log_info "Executing command: $*"
        exec "$@"
    fi
}

# Run main function with all arguments
main "$@" &
MAIN_PID=$!

# Wait for the main process
wait $MAIN_PID