# NoExcuse API

Standalone Node.js / Express API for NoExcuse (HabitMaker), with MongoDB Atlas storage, email/password accounts, and private habit progress. Supports custom weekday schedules and revision checks to prevent stale devices overwriting newer data.

## Local development

Requires Node.js 22 (22.18 or newer recommended).

```powershell
npm ci
Copy-Item .env.example .env
```

Set `MONGODB_URI` and a unique random `JWT_SECRET` (at least 32 characters) in `.env`, then run:

```powershell
npm run dev
```

Generate a session secret with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

The server connects to MongoDB, creates unique email/user-ID indexes, and listens on `0.0.0.0` using `PORT` (default 4000). Passwords are hashed with scrypt; sessions expire after 30 days.

## Deploy on Railway

1. Create a Railway service from this GitHub repository. Leave its root directory at the repository root.
2. Add service variables:

| Variable | Value |
| --- | --- |
| `MONGODB_URI` | Your Atlas connection string, including database-user credentials |
| `MONGODB_DB` | `noexcuse` |
| `JWT_SECRET` | A unique random secret, at least 32 characters |
| `CORS_ORIGINS` | Exact comma-separated origins of allowed web frontends (no trailing slash) |
| `TRUST_PROXY` | `true` when running behind Railway's single trusted proxy |

Railway supplies `PORT`. No compilation step is needed. The included `railway.json` sets `npm start` and the `/health` deployment health check. See [Railway configuration documentation](https://docs.railway.com/config-as-code).

Allow the service's outbound network access in Atlas, then deploy and generate a public HTTPS domain. `/health` should return `{"status":"ok"}`. The server does not start until its initial MongoDB connection succeeds, so deployment needs valid Atlas credentials and network access.

Set the mobile app's `EXPO_PUBLIC_API_URL` to the generated HTTPS domain and restart/rebuild the mobile app. Native apps do not require a CORS origin. A browser frontend does.

Never commit `.env` or downloaded Atlas credential files. `.env.example` contains placeholders only. Keep secrets in Railway's service variables.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Startup health check |
| POST | `/auth/register` | Create an account with `{email,password}` |
| POST | `/auth/login` | Sign in with `{email,password}` |
| GET | `/state` | Read authenticated user's state and revision |
| PUT | `/state` | Save `{state,revision}`; returns 409 for a stale revision |

State endpoints require `Authorization: Bearer <token>`. State contains `challenges` and `entries`. Habits optionally include `days`: unique weekday numbers, Sunday 0 through Saturday 6. Omitting `days` means every day. Each saved entry snapshots its checklist, completed habit IDs, date, and optional note.

## Tests and limitations

```powershell
npm test
```

Tests cover authentication, account isolation, concurrent writes, weekday validation, and malformed entries with an in-memory database adapter. A real Atlas connection is a separate deployment check. Mobile progress-calculation tests live in the mobile app repository/workspace, not this API repository.

This personal-use app does not yet implement password reset, email verification, account deletion, or automated backups. Rate limits are per process and reset on restart.
