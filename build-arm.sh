#!/bin/bash

# Build script for ARM/Raspberry Pi deployment
# This script handles the Docker build process with ARM-specific optimizations

set -e

echo "🚀 Building WhatsApp LLM PA for ARM/Raspberry Pi..."

# Clean up any previous builds
echo "🧹 Cleaning up previous builds..."
docker system prune -f --volumes || true

# Create required directories
echo "📁 Creating required directories..."
mkdir -p ./data ./sessions ./logs

# Set proper permissions for Raspberry Pi
echo "🔐 Setting directory permissions..."
chmod 755 ./data ./sessions ./logs

# Build the Docker image with ARM optimizations
echo "🔨 Building Docker image for ARM architecture..."
export DOCKER_BUILDKIT=1
docker-compose build --no-cache --progress=plain

# Verify the build
echo "✅ Build complete! Checking image..."
docker images | grep whatsapp-llm-pa

echo ""
echo "✨ Build successful! You can now run:"
echo "   docker-compose up -d"
echo ""
echo "📋 To check logs:"
echo "   docker-compose logs -f"
echo ""
echo "🔍 To check container status:"
echo "   docker-compose ps"
echo ""