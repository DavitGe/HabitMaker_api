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

## Deploy on Render (Free)

In Render, choose **New → Web Service**, connect this GitHub repository, and use:

| Setting | Value |
| --- | --- |
| Branch | `main` |
| Runtime | Node |
| Root Directory | Leave blank |
| Build Command | `npm ci` |
| Start Command | `npm start` |
| Instance Type | Free |
| Health Check Path | `/health` |

Add these environment variables before deploying:

| Variable | Value |
| --- | --- |
| `MONGODB_URI` | Your Atlas connection string, including database-user credentials |
| `MONGODB_DB` | `noexcuse` |
| `JWT_SECRET` | A unique random secret, at least 32 characters |
| `CORS_ORIGINS` | Exact comma-separated origins of allowed web frontends (no trailing slash) |
| `TRUST_PROXY` | `true` for the hosted service behind Render's proxy |
| `NODE_ENV` | `production` |

For browser development, `CORS_ORIGINS` can be `http://localhost:8081,http://localhost:19006`. Add your hosted frontend's exact origin when available. Native apps do not send an Origin header.

Render supplies `PORT`; do not hardcode it in the dashboard. No compilation step is needed. The `package.json` requests Node.js 22.

Alternatively, choose **New → Blueprint** and select this repository. The included `render.yaml` configures a Free web service and generates a session secret. Enter your `MONGODB_URI` when prompted. With the manual Web Service flow, enter the variables yourself; Blueprint values are not automatically imported into a manually created service.

On your Render service page, open **Connect → Outbound**. Add all listed CIDR ranges to your Atlas project's IP Access List, then deploy/redeploy. See [Render outbound IP documentation](https://render.com/docs/outbound-ip-addresses). Your service can use any IP in those ranges.

Open `https://YOUR-SERVICE.onrender.com/health`; it should return `{"status":"ok"}`. The server does not start until its initial MongoDB connection succeeds, so deployment needs valid Atlas credentials and network access. If the first deployment fails while you configure Atlas, redeploy after the IP access list is active.

Set the mobile app's `EXPO_PUBLIC_API_URL` to the generated HTTPS domain and restart/rebuild the mobile app. Native apps do not require a CORS origin. A browser frontend does.

Never commit `.env` or downloaded Atlas credential files. `.env.example` contains placeholders only. Keep secrets in Render's environment variables.

Free web services sleep after 15 minutes without inbound traffic and take about a minute to wake. The mobile app currently times out requests after 15 seconds: if a request fails during wake-up, open `/health`, wait for it to respond, and retry in the app. Habit data stays in MongoDB when the API sleeps or restarts. See [Render Free plan limitations](https://render.com/docs/free).

Render setup references: [Node/Express deployment](https://render.com/docs/deploy-node-express-app), [Blueprint configuration](https://render.com/docs/blueprint-spec). The optional `railway.json` can be ignored on Render.

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
