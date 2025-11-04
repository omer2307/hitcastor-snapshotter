# Hitcastor Snapshotter

Daily Spotify chart snapshotter service for Hitcastor prediction markets. Fetches Spotify Daily Top-200 CSV, converts to Top-100 JSON, uploads to object storage and IPFS, and maintains cryptographic hashes for evidence verification.

## What it does

1. **Scheduled Fetching**: Runs daily at 00:00 UTC to fetch yesterday's Spotify Daily Top-200 charts
2. **Data Normalization**: Converts CSV to standardized Top-100 JSON with consistent schema
3. **Cryptographic Hashing**: Computes SHA256 hashes for both CSV and JSON artifacts
4. **Object Storage**: Uploads artifacts to S3/R2 with object-lock for immutability
5. **IPFS Pinning**: Optionally pins JSON to IPFS for decentralized storage
6. **Database Recording**: Stores metadata and hashes in Postgres for fast lookups

## Schedule & SLA

- **Trigger**: 00:00:00 UTC daily
- **Target**: Yesterday's chart data (charts may publish with delay)
- **Retry**: Up to 36 hours with exponential backoff
- **Alert**: Slack notification if data unavailable after 24+ hours

## JSON Schema

The service produces standardized evidence artifacts with this schema:

```typescript
interface Top100Schema {
  schema: 'hitcastor.spotify.top100.v1'
  dateUTC: string              // YYYY-MM-DD
  region: string               // 'global'
  provider: 'spotify'
  sourceCsvUrl: string         // Original Spotify Charts URL
  sourceCsvSha256: string      // 0x-prefixed hash of CSV
  listLength: 100
  items: Array<{
    rank: number               // 1-100
    trackId: string           // spotify:track:xxxxx
    title: string
    artist: string
    streams: number
    isrc: string              // International Standard Recording Code
    spotifyUrl: string        // https://open.spotify.com/track/xxxxx
  }>
}
```

## Evidence Fields

These fields are consumed by the Resolver contract and API:

- **`sourceCsvSha256`**: Hash of original CSV for verification
- **`dateUTC`**: Date identifier for t0/t1 evidence pairs
- **`items[].rank`**: Used for market resolution (t0Rank, t1Rank)
- **JSON hash**: Computed by storage layer for integrity

## Local Development

### Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL
- Redis
- S3/R2 credentials

### Setup

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

3. **Setup database:**
   ```bash
   pnpm migrate
   ```

4. **Development mode:**
   ```bash
   pnpm dev
   ```

### Docker Compose (Optional)

For local Postgres + Redis:

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: hitcastor
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

## Commands

### Production
```bash
pnpm start          # Start production server + worker
```

### Development
```bash
pnpm dev            # Start with hot reload + test job
pnpm build          # Compile TypeScript
pnpm type-check     # Type checking only
```

### CLI Operations
```bash
# Run single snapshot
pnpm once --date=2024-01-15

# Backfill date range
pnpm backfill --from=2024-01-01 --to=2024-01-31

# Force re-snapshot (overwrite existing)
pnpm once --date=2024-01-15 --force

# Different region
pnpm once --date=2024-01-15 --region=us

# Database migration
pnpm migrate
```

### Testing
```bash
pnpm test              # Run test suite
pnpm test:coverage     # Run with coverage report
```

## Safety & Idempotency

- **Idempotent writes**: Re-running the same date won't create duplicates
- **Hash verification**: Stored hashes must match computed hashes
- **Object locking**: S3/R2 objects are write-once (if configured)
- **Graceful failures**: Missing data triggers retries, not crashes
- **Rate limiting**: Backfill includes delays to avoid overwhelming Spotify

## Backfill Instructions

**Safe backfill for large ranges:**

```bash
# Backfill 2024 Q1 with 10-second delays
pnpm backfill --from=2024-01-01 --to=2024-03-31 --delay=10000

# Check for missing data first
pnpm backfill --from=2024-01-01 --to=2024-03-31 --delay=1000 | grep "already exists"
```

**Emergency re-processing:**

```bash
# Force re-snapshot if data corrupted
pnpm once --date=2024-01-15 --force
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REGION` | Spotify region | `global` |
| `MAX_RETRY_HOURS` | Max retry window | `36` |
| `INITIAL_RETRY_DELAY_MS` | First retry delay | `300000` (5min) |
| `OBJECT_STORE_OBJECT_LOCK` | Enable object locking | `true` |
| `SLACK_WEBHOOK_URL` | Alert endpoint | - |

### Spotify Charts URL

The service uses a configurable URL template:

```
https://charts.spotify.com/api/charts/regional-${REGION}-daily/latest
```

Placeholders:
- `${REGION}`: Replaced with env.REGION value
- `${DATE}`: Future enhancement for date-specific URLs

## Monitoring

### Health Endpoint

**GET /health**

```json
{
  "status": "ok",
  "service": "hitcastor-snapshotter",
  "version": "1.0.0",
  "timestamp": "2024-01-15T12:00:00.000Z",
  "region": "global",
  "lastSnapshot": {
    "dateUTC": "2024-01-14",
    "region": "global", 
    "createdAt": "2024-01-15T00:05:23.000Z",
    "csvSha256": "0x...",
    "jsonSha256": "0x...",
    "ipfsCid": "QmXXX..."
  }
}
```

### Logs

Structured logs include:
- `dateUTC`, `region` for all operations
- `csvSha256`, `jsonSha256` for completed snapshots
- `jobId` for job tracking
- Error details for failures

### Alerts

Configure `SLACK_WEBHOOK_URL` to receive alerts when:
- Chart data unavailable for 24+ hours
- Repeated job failures
- Service health check failures

## Architecture

```
┌─────────────────┐    ┌──────────────┐    ┌─────────────────┐
│   Scheduler     │    │   Worker     │    │   HTTP API      │
│   (BullMQ)      │───▶│  (BullMQ)    │    │   (Fastify)     │
└─────────────────┘    └──────────────┘    └─────────────────┘
         │                       │                    │
         │                       ▼                    ▼
         │              ┌─────────────────┐  ┌─────────────────┐
         │              │   Object Store  │  │   Database      │
         │              │   (S3/R2)       │  │   (Postgres)    │
         └──────────────▶└─────────────────┘  └─────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │      IPFS       │
                        │   (Optional)    │
                        └─────────────────┘
```

## License

MIT