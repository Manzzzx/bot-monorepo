# Workspace Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the monorepo foundation, package layout, TypeScript config, lint/format config, and baseline scripts.

**Architecture:** Root owns orchestration; apps are deployable entries; packages are reusable internal modules. No business behavior in this phase.

**Tech Stack:** npm workspaces, Turborepo, TypeScript strict ESM, ESLint flat config, Prettier, Vitest.

---

## Files

- Create: `package.json`, `tsconfig.base.json`, `turbo.json`, `.gitignore`, `.prettierrc`, `eslint.config.js`, `vitest.workspace.ts`, `.bash_profile`
- Create dirs: `apps/{bot,wa,tele}/src`, `packages/{contracts,core,adapters,db,features,utils}/src`, `prisma`, `.github/workflows`
- Create package manifests + `tsconfig.json` for each app/package

## Task 1: Root skeleton

- [ ] **Step 1: Create directories**

Run:

```powershell
New-Item -ItemType Directory -Force -Path apps/bot/src,apps/wa/src,apps/tele/src,packages/contracts/src,packages/core/src,packages/adapters/src,packages/db/src,packages/features/src,packages/utils/src,prisma,.github/workflows | Out-Null
```

Expected: dirs exist.

- [ ] **Step 2: Create root `package.json`**

Use:

```json
{
  "name": "bot-monorepo",
  "private": true,
  "type": "module",
  "packageManager": "npm@10",
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "test:coverage": "turbo run test:coverage",
    "lint": "turbo run lint",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "start": "npx prisma migrate deploy && node apps/bot/dist/index.js",
    "start:wa": "npx prisma migrate deploy && node apps/wa/dist/index.js",
    "start:tele": "npx prisma migrate deploy && node apps/tele/dist/index.js",
    "dev": "turbo run dev --filter=@app/bot",
    "dev:wa": "turbo run dev --filter=@app/wa",
    "dev:tele": "turbo run dev --filter=@app/tele",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:deploy": "prisma migrate deploy"
  },
  "devDependencies": {
    "@eslint/js": "latest",
    "@types/node": "latest",
    "@vitest/coverage-v8": "latest",
    "eslint": "latest",
    "prettier": "latest",
    "prisma": "latest",
    "tsx": "latest",
    "turbo": "latest",
    "typescript": "latest",
    "typescript-eslint": "latest",
    "vitest": "latest"
  }
}
```

- [ ] **Step 3: Create config files**

Create `tsconfig.base.json` with `NodeNext`, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `declaration`, `sourceMap`, `rootDir=src`, `outDir=dist`.

Create `turbo.json` with build/test/lint/dev tasks.

Create `.prettierrc` with single quotes, semis, trailing commas, print width 100.

Create `.gitignore` excluding `node_modules/`, `dist/`, `coverage/`, `.env*`, `prisma/dev.db*`, `data/`, `*.log` but allowing `.env.example`.

## Task 2: Package manifests

- [ ] **Step 1: Create app manifests**

For `apps/bot`, `apps/wa`, `apps/tele`, create package names `@app/bot`, `@app/wa`, `@app/tele` with scripts: `build`, `dev`, `test`, `test:coverage`, `lint`.

- [ ] **Step 2: Create package manifests**

For `packages/contracts`, `core`, `adapters`, `db`, `features`, `utils`, create names `@bot/<name>` with `main=dist/index.js`, `types=dist/index.d.ts`, exports map, scripts: `build`, `test`, `test:coverage`, `lint`.

- [ ] **Step 3: Create per-package `tsconfig.json`**

Each app/package:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "composite": true },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 4: Placeholder entries**

Each `src/index.ts` contains:

```ts
export {};
```

## Task 3: Verify scaffold

- [ ] Run `npm install`. Expected: lockfile created.
- [ ] Run `npm run build`. Expected: all placeholders compile.
- [ ] Run `npm run lint`. Expected: no errors.
- [ ] Run `npm run format:check`. Expected: pass.
- [ ] Run `git diff --stat`. Expected: scaffold files only; do not commit unless user asks.
