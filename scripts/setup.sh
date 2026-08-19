#!/bin/bash
# One-command setup for Performance Command Center
# Usage: bash scripts/setup.sh

set -e
echo "🚀 Performance Command Center — Setup"
echo "========================================"

# 1. Check prerequisites
echo ""
echo "📋 Checking prerequisites..."
command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required. Install: brew install node"; exit 1; }
command -v psql >/dev/null 2>&1 || { echo "❌ PostgreSQL is required. Install: brew install postgresql@16"; exit 1; }
echo "✅ Node.js $(node --version)"
echo "✅ PostgreSQL $(psql --version | head -1)"

# 2. Create database
echo ""
echo "🗄️  Setting up database..."
createdb perf_marketing 2>/dev/null || echo "   (database already exists)"
psql -d perf_marketing -f supabase/migrations/001_create_tables.sql -q 2>/dev/null || true
psql -d perf_marketing -f supabase/migrations/002_create_views.sql -q 2>/dev/null || true
psql -d perf_marketing -f supabase/migrations/003_create_functions.sql -q 2>/dev/null || true
echo "✅ Database ready"

# 3. Seed demo data
echo ""
echo "📊 Loading demo data..."
psql -d perf_marketing -f scripts/seed_demo_data.sql -q 2>/dev/null
echo "✅ Demo data loaded (Rize campaigns: Google + Meta, 14 days)"

# 4. Install Node dependencies
echo ""
echo "📦 Installing dependencies..."
cd packages/web
npm install --silent 2>/dev/null
cd ../..
echo "✅ Dependencies installed"

# 5. Create .env.local if not exists
if [ ! -f packages/web/.env.local ]; then
  echo ""
  echo "📝 Creating .env.local (demo mode — no API creds needed for sample data)..."
  cat > packages/web/.env.local << 'ENVEOF'
# Database (required)
DATABASE_URL=postgresql://localhost:5432/perf_marketing

# Meta Ads API (optional — dashboard works with seeded data without this)
META_ADS_ACCESS_TOKEN=
META_ADS_ACCOUNT_ID=

# Google Ads API (optional — dashboard works with seeded data without this)
GOOGLE_ADS_DEVELOPER_TOKEN=
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_REFRESH_TOKEN=
GOOGLE_ADS_LOGIN_CUSTOMER_ID=
GOOGLE_ADS_CUSTOMER_IDS=
ENVEOF
  echo "✅ .env.local created (demo mode)"
fi

# 6. Done
echo ""
echo "========================================"
echo "✅ Setup complete!"
echo ""
echo "Start the dashboard:"
echo "  cd packages/web && npx next dev -p 3000"
echo ""
echo "Open: http://localhost:3000/dashboard"
echo ""
echo "📌 The dashboard works with seeded sample data."
echo "   To connect live APIs, fill in credentials in packages/web/.env.local"
echo "   See .env.example for instructions on getting each credential."
echo "========================================"
