# Deploy Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CI deploy artifacts, Pterodactyl boot support, backup instructions, and full acceptance verification.

**Architecture:** GitHub Actions builds from `main` and force-pushes artifact to `deploy`. Pterodactyl pulls `deploy`, `.bash_profile` runs `npm start`.

**Tech Stack:** GitHub Actions, npm, Prisma migrate deploy, Pterodactyl universal Debian egg, SQLite backup API.

---

## Files

- Create: `.github/workflows/deploy.yml`
- Create/modify: `.bash_profile`
- Create: `.env.example`
- Create: `docs/deploy-pterodactyl.md`
- Modify: `README.md`

## Task 1: Env and startup

- [ ] Create `.env.example` with all config fields: `NODE_ENV`, `LOG_LEVEL`, `LOG_DIR`, `LOG_NO_COLOR`, `DATABASE_URL`, `AUTH_ENCRYPTION_KEY`, WA/Tele toggles and owners.
- [ ] Create `.bash_profile`:

```bash
cd /home/container
exec npm start
```

- [ ] Document that Pterodactyl egg runs `exec /bin/bash -li`, so `.bash_profile` starts app.

## Task 2: GitHub Actions deploy workflow

- [ ] Write `.github/workflows/deploy.yml`.
- [ ] Workflow steps: checkout, setup Node 20, `npm ci`, `npx prisma generate`, `npm run build`, orphan branch `deploy`, add runtime files, force push.
- [ ] Include note: committing `node_modules` is large; fallback is panel install if branch grows too much.

## Task 3: Pterodactyl deploy guide

- [ ] Create `docs/deploy-pterodactyl.md`.
- [ ] Include variables:

```text
INSTALL_BRANCH=deploy
AUTO_UPDATE=true
CLOUDFLARE_TUNNEL=false
ENABLE_XVFB=false
NPM_PACKAGES=
CUSTOM_ENVIRONMENT_VARIABLES=NODE_ENV=production;LOG_LEVEL=info;DATABASE_URL=file:/home/container/data/bot.db;AUTH_ENCRYPTION_KEY=<64hex>;WA_ENABLED=true;OWNER_WA=<jid>;TELE_ENABLED=true;TELEGRAM_BOT_TOKEN=<token>;OWNER_TG=<id>
```

- [ ] Include SQLite hot backup command:

```bash
mkdir -p /home/container/backups
sqlite3 /home/container/data/bot.db ".backup '/home/container/backups/bot-$(date +%s).db'"
```

## Task 4: Acceptance checklist docs

- [ ] Add README checklist for workspace build/test/lint/format.
- [ ] Add runtime smoke checklist: WA QR, Tele online, ping/help/menu/remind.
- [ ] Add guard checklist: owner command reject, group command reject in DM/non-owner.
- [ ] Add DB checklist: WAL active, auth blob encrypted.
- [ ] Add log checklist: same `eventId` in terminal and file.

## Task 5: Manual verification commands

- [ ] Verify WAL:

```bash
sqlite3 /home/container/data/bot.db "PRAGMA journal_mode;"
```

Expected: `wal`.

- [ ] Verify log fan-out:

```bash
grep '<eventId>' /home/container/data/log/bot-*.log
```

Expected: exactly one JSON entry.

- [ ] Verify auth blob:

```bash
sqlite3 /home/container/data/bot.db "SELECT hex(encryptedBlob) FROM WAAuthState LIMIT 1;"
```

Expected: hex bytes, not JSON text.

## Task 6: Final validation

- [ ] Run `npm install`.
- [ ] Run `npm run build`.
- [ ] Run `npm run test`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run format:check`.
- [ ] Run `git diff --stat`; do not commit unless user asks.
