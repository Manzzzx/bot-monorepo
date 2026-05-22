# Deploy on Pterodactyl

This guide assumes the **Universal Debian** egg (or similar Node-capable egg) which boots the container with `exec /bin/bash -li`. With that startup line, the shell loads `~/.bash_profile`, and the project ships a `.bash_profile` that runs `npm start`.

## 1. Build pipeline

GitHub Actions (`.github/workflows/deploy.yml`) builds from `main` and force-pushes a runtime artifact to the `deploy` branch on every push:

- `npm ci`
- `npx prisma generate`
- `npm run build`
- copy `apps/*/dist`, `packages/*/dist`, `prisma/`, `package.json`, `package-lock.json`, `prisma.config.ts`, `.bash_profile`, `.env.example` to an orphan branch
- (optional) `npm ci --omit=dev` so the artifact is runnable as-is
- `git push --force origin deploy`

> Note: committing `node_modules` makes the `deploy` branch large. If the branch grows too much, drop the `npm ci --omit=dev` step from the workflow and let the panel install step handle dependencies.

## 2. Egg configuration

Set these variables on the server:

```text
INSTALL_BRANCH=deploy
AUTO_UPDATE=true
CLOUDFLARE_TUNNEL=false
ENABLE_XVFB=false
NPM_PACKAGES=
CUSTOM_ENVIRONMENT_VARIABLES=NODE_ENV=production;LOG_LEVEL=info;DATABASE_URL=file:/home/container/data/bot.db;AUTH_ENCRYPTION_KEY=<64hex>;WA_ENABLED=true;OWNER_WA=<jid>;TELE_ENABLED=true;TELEGRAM_BOT_TOKEN=<token>;OWNER_TG=<id>
```

Generate `AUTH_ENCRYPTION_KEY` once and reuse it across restarts:

```bash
openssl rand -hex 32
```

## 3. Startup flow

1. Egg runs `exec /bin/bash -li`.
2. Login shell sources `/home/container/.bash_profile`.
3. `.bash_profile` executes:

   ```bash
   cd /home/container
   exec npm start
   ```

4. `npm start` runs `npx prisma migrate deploy` then `node apps/bot/dist/index.js`.

## 4. Persistent data layout

```
/home/container/
  data/
    bot.db          # SQLite DB (WAL mode)
    bot.db-wal
    bot.db-shm
    log/            # rotated pino-roll logs
    wa-auth/        # Baileys auth (encrypted blob mirrored to DB)
  backups/          # SQLite hot backups (manual / cron)
```

## 5. SQLite hot backup

The DB is opened with WAL, so use the SQLite backup API to copy a consistent snapshot without stopping the bot:

```bash
mkdir -p /home/container/backups
sqlite3 /home/container/data/bot.db ".backup '/home/container/backups/bot-$(date +%s).db'"
```

Schedule via Pterodactyl scheduled tasks (or cron in a sidecar) for nightly snapshots. Rotate old backups by `mtime`.

## 6. Manual verification

After first boot, confirm runtime invariants:

```bash
# WAL active
sqlite3 /home/container/data/bot.db "PRAGMA journal_mode;"
# expected: wal

# Log fan-out (replace <eventId> with an id from terminal output)
grep '<eventId>' /home/container/data/log/bot-*.log
# expected: exactly one JSON entry

# Auth blob encrypted (no JSON in the column)
sqlite3 /home/container/data/bot.db "SELECT hex(encryptedBlob) FROM WAAuthState LIMIT 1;"
# expected: hex bytes, not JSON text
```

## 7. Updating

With `AUTO_UPDATE=true` the egg pulls the latest `deploy` tip on (re)install. To force a fresh deploy, click **Reinstall** in the panel after the workflow finishes.