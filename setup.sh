#!/bin/bash

# HubSpot OAuth Connector - Local Setup Script
# This script sets up the development environment locally

echo "🚀 HubSpot OAuth Connector - Local Setup"
echo "=========================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16+ from https://nodejs.org"
    exit 1
fi

echo "✅ Node.js $(node --version) detected"

# Create .env files if they don't exist
if [ ! -f backend/.env ]; then
    echo "📝 Creating backend/.env from template..."
    cp backend/.env.example backend/.env
    echo "⚠️  Please edit backend/.env with your HubSpot credentials"
fi

if [ ! -f frontend/.env ]; then
    echo "📝 Creating frontend/.env from template..."
    cp frontend/.env.example frontend/.env
fi

# Install dependencies
echo ""
echo "📦 Installing backend dependencies..."
cd backend
npm install
cd ..

echo "📦 Installing frontend dependencies..."
cd frontend
npm install
cd ..

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Get HubSpot credentials from https://developers.hubspot.com"
echo "2. Edit backend/.env with your CLIENT_ID and CLIENT_SECRET"
echo "3. Run: npm run dev:backend (in one terminal)"
echo "4. Run: npm run dev:frontend (in another terminal)"
echo "5. Visit http://localhost:3000"
echo ""
