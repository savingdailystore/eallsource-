# Arbitrage Pro AI — Deployment Guide

## Prerequisites

- Node.js 20+
- PostgreSQL 16+
- Redis 7+
- npm 10+

---

## Quick Start (Local Development)

### 1. Clone and install

```bash
cd arbitrage-pro-ai
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your values
```

Minimum required variables for local dev:
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/arbitrage_pro"
REDIS_URL="redis://localhost:6379"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="any-random-string-32-chars"
```

### 3. Start PostgreSQL and Redis

```bash
docker-compose up postgres redis -d
```

### 4. Run database migrations and seed

```bash
npm run db:generate   # generate Prisma client
npm run db:push       # push schema to DB
npm run db:seed       # seed demo data
```

### 5. Start the app

```bash
npm run dev
```

Open http://localhost:3000

**Demo credentials:**
- Email: `demo@arbitragepro.ai`
- Password: `Demo123!`

**Admin credentials:**
- Email: `admin@arbitragepro.ai`
- Password: `Admin123!`

### 6. Start background worker (optional, separate terminal)

```bash
npm run worker
```

---

## Docker Deployment (All-in-one)

```bash
# Copy and configure environment
cp .env.example .env
# Edit NEXTAUTH_SECRET and any API keys

# Build and start all services
docker-compose up -d --build

# Check logs
docker-compose logs -f app
```

Services:
- App: http://localhost:3000
- PostgreSQL: localhost:5432
- Redis: localhost:6379

---

## Production Deployment

### Frontend — Vercel

1. Push to GitHub
2. Connect repo to Vercel
3. Set environment variables in Vercel dashboard:
   - `DATABASE_URL` — point to Railway/Supabase/Neon PostgreSQL
   - `REDIS_URL` — point to Upstash Redis
   - `NEXTAUTH_URL` — your production domain
   - `NEXTAUTH_SECRET` — secure random string
   - All API keys (Keepa, Amazon SP-API, cashback providers)

### Backend Worker — Railway

1. Create a new Railway service from the same repo
2. Set start command: `npm run worker`
3. Set same environment variables as above

### Database — Railway or Supabase

```bash
# Run migrations on production DB
npx prisma migrate deploy

# Seed production (first time only)
npm run db:seed
```

### Alternative: AWS ECS + RDS + ElastiCache

Deploy using provided `Dockerfile` and `Dockerfile.worker`.

---

## API Keys Setup

### Amazon SP-API
1. Register as a developer at https://developer.amazonservices.com
2. Create an IAM user with SP-API permissions
3. Generate client credentials and refresh token
4. Set `AMAZON_CLIENT_ID`, `AMAZON_CLIENT_SECRET`, `AMAZON_REFRESH_TOKEN`

### Keepa API
1. Register at https://keepa.com/#!api
2. Get API key from dashboard
3. Set `KEEPA_API_KEY`

### Cashback Providers
Each provider has their own affiliate/API program:
- **Rakuten**: Publisher account at rakuten.com/advertising
- **BeFrugal**: Affiliate program at befrugal.com
- **TopCashback**: Publisher program at topcashback.com
- **RetailMeNot**: Publisher API at retailmenot.com

> **Note:** Without API keys, the platform uses realistic simulated data for all external services.
> You can demo the full UI immediately without any API credentials.

---

## Architecture

```
┌─────────────────────┐     ┌──────────────────────┐
│   Next.js (Vercel)  │────▶│  PostgreSQL (Railway) │
│   - App Router      │     └──────────────────────┘
│   - API Routes      │     ┌──────────────────────┐
│   - NextAuth        │────▶│   Redis (Upstash)    │
└─────────────────────┘     └──────────────────────┘
         │
         ▼
┌─────────────────────┐     ┌──────────────────────┐
│  BullMQ Worker      │────▶│  Amazon SP-API       │
│  (Railway/ECS)      │────▶│  Keepa API           │
│  - Weekly scan cron │────▶│  Cashback APIs       │
│  - IP risk engine   │     └──────────────────────┘
│  - ROI calculator   │
└─────────────────────┘
```

---

## Adding New Retailers

1. Add retailer to `prisma/seed.ts` `retailers` array
2. Implement scraper in `src/services/scanner/` following existing patterns
3. Add product stubs to `SAMPLE_PRODUCTS` in `weekly-feed.ts`
4. Run `npm run db:seed` to register the source

## Adding New Cashback Providers

In `src/services/cashback/index.ts`:

```typescript
class NewProviderCashback implements CashbackProvider {
  name = 'NewProvider';
  async lookup(retailer: string, url: string): Promise<DiscountItem[]> {
    // Call real API here
    return [...];
  }
}

// Register it:
addCashbackProvider(new NewProviderCashback());
```
