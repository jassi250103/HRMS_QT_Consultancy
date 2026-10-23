# QT Consultancy HRMS — Setup & Operations Guide

Express 5 + vanilla-JS SPA on native **PostgreSQL 18** (local install, service
`postgresql-x64-18`, data in `D:\psql\data`). **No Docker.**

The whole app (API + portal) runs from this `server/` folder. Commands below are
run from `server/`.

---

## 1. Prerequisites

- **Node.js ≥ 20.11** (uses `process.loadEnvFile`, `node --test --test-force-exit`).
- **PostgreSQL 18** running locally on `localhost:5432`, reachable with the
  superuser (`postgres`) password.
- Camera/face features need the face-api models (see §6).

---

## 2. One-time install

```bash
cd server
npm install
cp .env.example .env        # Windows: copy .env.example .env
npm run db:create           # prompts for the postgres superuser password
```

`db:create` creates the `hrms` role + `hrms` database and prints a line like:

```
DATABASE_URL=postgres://hrms:<generated-password>@localhost:5432/hrms
```

Paste that line into `server/.env`, then apply the schema:

```bash
npm run migrate             # creates all tables + the default policy row
```

At this point the database is **empty** (no users). Choose one path below.

---

## 3. Two ways to get a first account

### 3a. Production (recommended — no demo data)

Create the top-level **Director** account. In this system the only role with
system-admin power (provision everyone else's logins, see all staff, override
approvals) is **`hr_admin`** — so the bootstrap account must be an `hr_admin`.

```bash
ADMIN_NAME="Aakash Kumar" \
ADMIN_LOGIN_ID="director@qtconsultancy.in" \
ADMIN_PASSWORD="Director@123" \
ADMIN_DESIGNATION="Director" \
npm run create-admin
```

- `ADMIN_NAME` and `ADMIN_LOGIN_ID` are required.
- `ADMIN_PASSWORD` is optional — omit it and the tool **generates a one-time
  password**, prints it once, and forces a change on first login.
- The tool is **safe to leave installed**: it refuses if the login already
  exists, and refuses if an active `hr_admin` already exists (override with
  `FORCE_ADMIN=1` to intentionally add a second admin).

Then sign in and add everyone else (HR, managers, recruiters) from the **Staff**
screen — an `hr_admin` provisions their logins. A "Director" who should only
manage a team (not the whole system) is created as role **`manager`**.

### 3b. Demo / prototype (loads sample staff, recruits, attendance)

```bash
npm run seed                # refuses on a non-empty DB unless --force
```

Demo login: `ananya.rao` / `Staffing@2026`. **Do not use this for production** —
it inserts fabricated people and truncates real tables.

---

## 4. Run the server

```bash
npm run dev      # watch mode (auto-reloads on src/ changes) — development
npm start        # plain node — production
```

Two listeners come up:

| URL | Purpose |
| --- | --- |
| `http://localhost:3000` | API + portal on this machine |
| `https://localhost:3443` | TLS listener — required for camera on other devices |

The startup log also prints the LAN HTTPS URLs (e.g. `https://192.168.31.124:3443`)
to open on a phone or shared PC.

---

## 5. Environment (`server/.env`)

| Variable | Default | Notes |
| --- | --- | --- |
| `NODE_ENV` | `development` | Set `production` in prod — forces a real `JWT_SECRET` |
| `DATABASE_URL` | `postgres://hrms:hrms@localhost:5432/hrms` | From `db:create` |
| `PORT` | `3000` | HTTP |
| `HTTPS_PORT` | `3443` | TLS listener for LAN camera |
| `CERT_DIR` | `server/certs` | Self-signed `key.pem` + `cert.pem` |
| `ORIGIN` | `http://localhost:3000` | Cookie/CSP origin |
| `JWT_SECRET` | dev placeholder | **Must** be set in production |
| `ACCESS_TOKEN_TTL` | `15m` | |
| `REFRESH_TOKEN_TTL_DAYS` | `14` | |
| `SERVE_UI` | `true` | Set `false` to run API-only |
| `UPLOAD_DIR` | `server/uploads` | Recruit documents |
| `LOGIN_RATE_MAX` | `10` | Sign-in attempts / min per IP+login |
| `FACE_MATCH_MAX_DISTANCE` | `0.5` | Face accept threshold (Euclidean) |
| `ENROLL_MIN_SCORE` | `0.6` | Min detection score to store a sample |

Generate a production secret:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

---

## 6. Face recognition & the camera on other devices

Browsers only expose `getUserMedia` on **https or localhost**. On this machine
`http://localhost:3000` works, but a **phone or shared PC must use the HTTPS
URL** (`https://<lan-ip>:3443`) and accept the one-time self-signed certificate
warning. Full details, model setup and troubleshooting: **see
[`FACE-RECOGNITION-SETUP.md`](../FACE-RECOGNITION-SETUP.md)**.

Download the face-api models once:

```bash
npm run setup-face-models   # puts .bin models in server/models, served at /models
```

Security model: face detection runs in the browser; the server stores 128-d
descriptors (no photos) and matches a live capture against enrolled samples
using **fail-closed Euclidean distance** (accept when distance ≤ threshold).
Attendance also requires a geofence match. Enrollment is one-time and only an
`hr_admin` can reset it.

---

## 7. Commands reference

| Command | What it does |
| --- | --- |
| `npm run db:create` | Creates the role + database on the local instance |
| `npm run migrate` | Applies pending SQL from `migrations/` |
| `npm run migrate:reset` | **Drops the whole schema** and re-applies every migration (all data gone) |
| `npm run seed` | Loads demo data (refuses on non-empty DB unless `--force`) |
| `npm run create-admin` | Creates the first `hr_admin` (env-driven, idempotent) |
| `npm run setup-face-models` | Downloads face-api `.bin` models |
| `npm start` / `npm run dev` | Run the API + portal |
| `npm test` | Resets schema, seeds, runs integration suite — **wipes the DB**, dev only |

---

## 8. Backup / wipe / restore runbook

**Always back up before a destructive step.**

```bash
# Back up (from server/):
mkdir -p backups
node -e "import('./src/config.js').then(m=>process.stdout.write(m.config.databaseUrl))" > /dev/null  # sanity
"D:\psql\bin\pg_dump.exe" "postgres://hrms:<pw>@localhost:5432/hrms" -f backups/backup-$(date +%Y%m%d-%H%M%S).sql

# Full wipe to a clean production DB:
npm run migrate:reset

# Recreate the admin:
ADMIN_NAME="..." ADMIN_LOGIN_ID="..." npm run create-admin

# Restore a backup if needed:
"D:\psql\bin\psql.exe" "postgres://hrms:<pw>@localhost:5432/hrms" -f backups/backup-<stamp>.sql
```

`migrate:reset` runs `DROP SCHEMA public CASCADE` then re-applies all migrations,
so it clears **everything** including master-data lists (`master_item`) and
leaves only the default `policy` row. After a reset, re-add companies / roles /
cities / hubs / reasons from the Master Data screen before staff use the app.

---

## 9. Roles & rules the server enforces

- Exactly three roles: **`recruiter`**, **`manager`**, **`hr_admin`**.
- A recruiter sees their own rows; a manager sees the reporting line below; the
  `hr_admin` sees everything and can provision any login.
- Only the direct manager decides; nobody decides their own request; an
  `hr_admin` decision is signed `Name · override`.
- Active → Not Active requires a reason (endpoint + DB `CHECK`).
- Master-data values in use are retired, never deleted; renames cascade.
- Late attendance and resignations are requests until accepted; the last day must
  satisfy the notice period.
- Passwords: scrypt hashes, minimum length, letter + number, history, temporary
  password shown once, five failures lock the account.
- Every decision and configuration change lands in append-only `audit_log`.

---

## 10. Layout

- `migrations/` — plain SQL, applied in filename order, tracked in `schema_migration`
- `src/cli/` — `migrate`, `seed`, `db-create`, `create-admin` entry points
- `src/security/` — scrypt hashing, JWT access tokens, single-use refresh tokens
- `src/services/` — role scope, policy, audit writer, face matcher, recruit filters
- `src/routes/` — one router per resource
- `certs/` — self-signed TLS for the LAN camera port
- `docs/openapi.yaml` — the whole HTTP surface
