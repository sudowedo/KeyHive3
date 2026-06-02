# Migrations

- `001_initial_postgres.sql` is the **frozen baseline**. Do not edit it after rollout.
- Add all future schema changes as additive migrations (`002_*.sql`, `003_*.sql`, ...).
- Current additive migrations:
  - `002_health_monitoring.sql`
  - `003_request_error_logs.sql`
  - `004_request_log_details.sql`

## Apply from scratch
```bash
psql "$DATABASE_URL" -f backend/migrations/001_initial_postgres.sql
psql "$DATABASE_URL" -f backend/migrations/002_health_monitoring.sql
psql "$DATABASE_URL" -f backend/migrations/003_request_error_logs.sql
psql "$DATABASE_URL" -f backend/migrations/004_request_log_details.sql
```

## Rules
1. Never rewrite historical migration files after environments adopt them.
2. Keep migrations forward-only.
3. If startup fails with schema drift error, re-apply missing migrations in order.
