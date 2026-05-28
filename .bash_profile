#!/usr/bin/env bash
# .bash_profile — login-shell entrypoint for the bot.
#
# Pterodactyl Universal eggs boot the container with `exec /bin/bash -li`,
# which sources this file. On a plain VPS, set the user's login shell to
# bash and this file will run automatically on `ssh` / `screen new-session`.
#
# Behaviour:
#   1. Move into the project directory.
#   2. Make sure `node` (>=20) is on PATH; bootstrap nvm if present.
#   3. Cold-start install dependencies if node_modules is missing.
#   4. Realign native modules to the running Node ABI (better-sqlite3).
#   5. `exec` into `npm run <entry>` so node becomes PID 1 and panel
#      restart signals (SIGTERM) reach the bot's graceful shutdown.
#
# Override defaults via egg/VPS env:
#   BOT_DIR=/home/container/bot-monorepo   # project root (default: $HOME/bot-monorepo)
#   BOT_ENTRY_SCRIPT=start                  # one of: start | start:wa | start:tele
#   SKIP_BOT_AUTOSTART=1                    # opt-out (e.g. when sshing for ops)

# Honour an interactive opt-out so you can SSH in for maintenance without
# losing the shell to `exec npm run start`.
if [ -n "${SKIP_BOT_AUTOSTART:-}" ]; then
  return 0 2>/dev/null || exit 0
fi

# Defensive shell flags. We don't use `set -e` because we want the
# diagnostic echoes to fire on failure paths instead of dying silently.
set -uo pipefail

BOT_DIR="${BOT_DIR:-$HOME/bot-monorepo}"
BOT_ENTRY_SCRIPT="${BOT_ENTRY_SCRIPT:-start}"
LOG_PREFIX="[bash_profile]"

log() { printf '%s %s\n' "$LOG_PREFIX" "$*" >&2; }
die() { log "$*"; exit 1; }

# 1) cd into the project root --------------------------------------------------
[ -d "$BOT_DIR" ] || die "BOT_DIR='$BOT_DIR' does not exist; set BOT_DIR or fix $HOME"
cd "$BOT_DIR" || die "cannot cd to '$BOT_DIR'"

# 2) Make node visible. nvm users often skip non-interactive PATH setup, so
#    we source it explicitly. Pterodactyl Universal eggs already inject node
#    onto PATH, so this is a no-op there.
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
fi

command -v node >/dev/null 2>&1 || die "node not on PATH (PATH=$PATH)"
command -v npm  >/dev/null 2>&1 || die "npm not on PATH"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "${NODE_MAJOR:-0}" -lt 20 ]; then
  die "node 20+ required (got $NODE_MAJOR); upgrade the runtime"
fi

# 3) Sanity-check the env. Either a committed .env / .env.production exists,
#    or the panel injects vars via CUSTOM_ENVIRONMENT_VARIABLES. If neither
#    is present and AUTH_ENCRYPTION_KEY is unset, fail before touching auth.
if [ ! -f .env ] && [ ! -f .env.production ] && [ -z "${AUTH_ENCRYPTION_KEY:-}" ]; then
  die "no .env / .env.production and AUTH_ENCRYPTION_KEY unset; refusing to boot"
fi
if grep -Eqs '^AUTH_ENCRYPTION_KEY=replace-with-' .env .env.production 2>/dev/null; then
  die "AUTH_ENCRYPTION_KEY still has the placeholder; rotate via 'openssl rand -hex 32'"
fi

# 4) Cold-start dependency install. Panel reinstall already runs npm install
#    once, so skip when node_modules is in place.
if [ ! -d node_modules ]; then
  log "node_modules missing; running 'npm ci --omit=dev' (fallback: npm install)"
  if ! npm ci --omit=dev; then
    log "'npm ci' failed; falling back to 'npm install --omit=dev'"
    npm install --omit=dev || die "dependency install failed"
  fi
fi

# 5) Realign native modules to whatever Node ABI we ended up on. Without this
#    a fresh `deploy` checkout pinned to a different Node minor errors out
#    with NODE_MODULE_VERSION mismatches at first DB open.
if ! SKIP_POSTINSTALL_REBUILD=1 npm rebuild better-sqlite3 >/tmp/bot-rebuild.log 2>&1; then
  log "npm rebuild better-sqlite3 reported errors (see /tmp/bot-rebuild.log); continuing"
fi

# 6) Hand off. `exec` so the panel sees node as the foreground process and
#    SIGTERM hits our shutdown.ts handler instead of bash.
log "starting bot via 'npm run $BOT_ENTRY_SCRIPT' @ $(date -Iseconds 2>/dev/null || date)"
exec npm run "$BOT_ENTRY_SCRIPT"
