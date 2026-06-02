# KeyGate — API Access Manager

Project-scoped API gateway for safely sharing model access without exposing provider secrets.

## Current status (May 2026)

KeyGate is now running on a **project-scoped architecture** with:

- Fastify backend (`backend/server.js`)
- PostgreSQL persistence + forward-only SQL migrations (`backend/migrations/*.sql`)
- Redis-backed rate limiting
- AES-256-GCM encryption for stored secrets/tokens
- React/Vite frontend dashboard (`frontend/`)
- Public health page UI + backend health/error logging endpoints

## Core capabilities

- **Projects-first isolation**
  - Master keys, subkeys, logs, quota requests are all scoped by `project_id`.
  - Console routes use `/console/:projectSlug/:page` style.
- **Master key management**
  - Provider keys are encrypted at rest.
  - Keys are masked in responses/UI.
- **Subkey lifecycle + governance**
  - Create/revoke/pause subkeys.
  - Limits for monthly tokens, max requests, expiry.
  - Provider/model compatibility validation.
- **Gateway proxy endpoint**
  - `POST /v1/chat/completions` with `Authorization: Bearer sk-kg-...`.
  - Enforces status, quota, rate-limit, allowed-model policy.
- **Observability**
  - `/health`, `/health/db`, `/health/redis`, `/api/health`.
  - Daily health snapshots in DB.
  - App error logs persisted in `app_error_logs`.

## Tech stack

- **Backend**: Node.js + Fastify
- **DB**: PostgreSQL
- **Cache/Rate limiting**: Redis
- **Frontend**: React + Vite
- **Crypto**: AES-256-GCM via `KEYHIVE_MASTER_KEY_BASE64`

## Local setup

### 1) Prerequisites

- Node.js 18+
- PostgreSQL
- Redis
- OpenSSL (for generating encryption key)

### 2) Configure env

Create backend `.env` with at least:

```env
PORT=3001
DATABASE_URL=postgres://USER:PASS@localhost:5432/keyhive
REDIS_URL=redis://localhost:6379
KEYHIVE_MASTER_KEY_BASE64=<32-byte-key-base64>
```

Generate key example:

```bash
openssl rand -base64 32
```

### 3) Apply migrations

```bash
psql "$DATABASE_URL" -f backend/migrations/001_initial_postgres.sql
psql "$DATABASE_URL" -f backend/migrations/002_health_monitoring.sql
psql "$DATABASE_URL" -f backend/migrations/003_request_error_logs.sql
```

Read `MIGRATIONS.md` for migration discipline and ordering.

### 4) Install and run

Backend:

```bash
cd backend
npm install
npm start
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

- Frontend default: `http://localhost:5173`
- Backend default: `http://localhost:3001`

## Important API notes

- Project-scoped admin APIs require `x-project-id` header.
- Project lifecycle endpoints are under `/api/projects`.
- Health endpoints:
  - `GET /health`
  - `GET /health/db`
  - `GET /health/redis`
  - `GET /api/health`
  - `POST /api/health/refresh-now` (internal/manual trigger)

## Security notes

- Subkey plaintext token is intended to be shown at creation time only (or controlled demo-token fetch flow), not broadly exposed in list APIs.
- Rotate/revoke keys immediately if any token was exposed during testing.

## Next milestones

See `next.txt` and `pricing.txt` for roadmap/product packaging drafts.
