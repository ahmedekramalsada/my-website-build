#!/bin/bash

# Universal Website Builder Platform - Quick Start Script

set -e

echo "🚀 Universal Website Builder Platform - Quick Start"
echo "=================================================="

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "✅ Docker and Docker Compose are installed"

# Navigate to docker-compose directory
cd infrastructure/docker-compose

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "✅ Created .env file. You can edit it to customize settings."
fi

# Start services
echo "🐳 Starting services with Docker Compose..."
docker-compose up -d --build

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check health
echo "🏥 Checking service health..."
max_attempts=30
attempt=1

while [ $attempt -le $max_attempts ]; do
    if curl -s http://api.localhost/health > /dev/null 2>&1; then
        echo "✅ API is healthy"
        break
    fi
    
    echo "⏳ Attempt $attempt/$max_attempts: API not ready yet, waiting..."
    sleep 5
    attempt=$((attempt + 1))
done

if [ $attempt -gt $max_attempts ]; then
    echo "⚠️  API health check timed out, but services may still be starting..."
fi

echo ""
echo "🎉 Universal Website Builder Platform is starting up!"
echo ""
echo "📊 Access Points:"
echo "   Dashboard:    http://dashboard.localhost"
echo "   API:          http://api.localhost"
echo "   Traefik UI:   http://traefik.localhost (admin/admin)"
echo ""
echo "📝 Next Steps:"
echo "   1. Open http://dashboard.localhost in your browser"
echo "   2. Click 'Sign up' to create your admin account"
echo "   3. Start creating websites!"
echo ""
echo "🔧 Useful Commands:"
echo "   View logs:    docker-compose logs -f"
echo "   Stop:         docker-compose down"
echo "   Restart:      docker-compose restart"
echo ""
echo "📚 Documentation: See README.md and PROJECT_PLAN.md"
echo ""
