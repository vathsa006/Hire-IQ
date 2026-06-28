#!/bin/bash

# Job Board AI - Setup Script
# Usage: ./setup.sh

echo "=== Job Board AI Setup ==="

# Check if .env exists
if [ ! -f .env ]; then
    echo "Creating .env file from example..."
    cp .env.example .env
    echo "Please edit .env file with your API keys!"
    exit 1
fi

# Install dependencies
echo "Installing dependencies..."
npm install

# Check if Docker is running for database
if command -v docker &> /dev/null; then
    echo "Starting PostgreSQL with Docker..."
    docker-compose up -d db
    echo "Waiting for database to be ready..."
    sleep 5
else
    echo "Docker not found. Please ensure PostgreSQL is running manually."
fi

# Push database schema
echo "Pushing database schema..."
npm run db:push

# Start development server
echo "Starting development server..."
npm run dev
