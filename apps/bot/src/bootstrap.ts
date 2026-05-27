import { config as loadDotenv } from 'dotenv';
import { dirname, isAbsolute, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

loadDotenv({ path: resolve(projectRoot, '.env'), quiet: true });

const FALLBACK_TZ = 'Asia/Jakarta';
const requestedTz = (process.env.TZ ?? FALLBACK_TZ).trim() || FALLBACK_TZ;
try {
  new Intl.DateTimeFormat('en-US', { timeZone: requestedTz });
  process.env.TZ = requestedTz;
} catch {
  process.stderr.write(
    `[bootstrap] Invalid TZ='${requestedTz}' (not an IANA name). Falling back to '${FALLBACK_TZ}'.\n`,
  );
  process.env.TZ = FALLBACK_TZ;
}

const rawDbUrl = process.env.DATABASE_URL;
if (rawDbUrl?.startsWith('file:')) {
  const filePath = rawDbUrl.slice('file:'.length);
  if (!isAbsolute(filePath)) {
    process.env.DATABASE_URL = `file:${resolve(projectRoot, filePath)}`;
  }
}

const rawLogDir = process.env.LOG_DIR;
if (rawLogDir && !isAbsolute(rawLogDir)) {
  process.env.LOG_DIR = resolve(projectRoot, rawLogDir);
}

import type { Logger } from 'pino';
import {
  AdapterRegistryImpl,
  createTeleAdapter,
  createWaAdapter,
  type TeleAdapter,
  type WaAdapter,
} from '@bot/adapters';
import {
  CommandRegistryImpl,
  InMemoryEventBus,
  RateLimitRegistryImpl,
  SchedulerImpl,
  createRouter,
  type Router,
} from '@bot/core';
import type { AppContext, MessageCtx } from '@bot/contracts';
import { createPrismaClient, type AppPrismaClient } from '@bot/db';
import { loadFeatures } from '@bot/features';
import {
  CircuitBreaker,
  CovenantProvider,
  HttpClient,
  ProviderHub,
  SiputzxProvider,
} from '@bot/providers';
import { createRootLogger, getConfigWarnings, loadConfig } from '@bot/utils';

export interface BootstrapOptions {
  config?: ReturnType<typeof loadConfig>;
  logger?: Logger;
  prisma?: AppPrismaClient;
  loadFeatures?: boolean;
  startAdapters?: boolean;
}

export interface BootstrapResult {
  app: AppContext<AppPrismaClient>;
  router: Router;
  scheduler: SchedulerImpl;
  prisma: AppPrismaClient;
  adapters: {
    wa: WaAdapter | null;
    tele: TeleAdapter | null;
  };
  shutdownTasks: Array<() => Promise<void> | void>;
}

export async function bootstrap(options: BootstrapOptions = {}): Promise<BootstrapResult> {
  const startedAt = performance.now();
  const config = options.config ?? loadConfig();
  const logger =
    options.logger ??
    (await createRootLogger({
      level: config.LOG_LEVEL,
      env: config.NODE_ENV,
      logDir: config.LOG_DIR,
      noColor: config.LOG_NO_COLOR,
      logPii: config.LOG_PII,
    }));

  for (const warning of getConfigWarnings(config)) logger.warn({ status: 'rejected' }, warning);

  const prisma = options.prisma ?? (await createPrismaClient({ databaseUrl: config.DATABASE_URL }));
  const bus = new InMemoryEventBus();
  const registry = new CommandRegistryImpl();
  const adapters = new AdapterRegistryImpl();
  const rateLimit = new RateLimitRegistryImpl(config);
  const scheduler = new SchedulerImpl({ db: prisma, bus, logger });

  const providerHttp = new HttpClient({
    timeoutMs: config.PROVIDER_HTTP_TIMEOUT_MS,
    minTimeMs: config.PROVIDER_RATE_MIN_TIME_MS,
    maxConcurrent: config.PROVIDER_MAX_CONCURRENT,
  });
  const siputzxProvider = new SiputzxProvider({
    http: providerHttp,
    logger: logger.child({ provider: 'siputzx' }),
  });
  const covenantProvider = config.COVENANT_API_KEY
    ? new CovenantProvider({
        http: providerHttp,
        apiKey: config.COVENANT_API_KEY,
        logger: logger.child({ provider: 'covenant' }),
      })
    : null;
  const providerBreaker = new CircuitBreaker(
    {
      threshold: config.PROVIDER_CIRCUIT_THRESHOLD,
      cooldownMs: config.PROVIDER_CIRCUIT_COOLDOWN_MS,
    },
    logger.child({ component: 'providers.circuit' }),
  );
  const providers = new ProviderHub({
    providers: { siputzx: siputzxProvider, covenant: covenantProvider },
    priority: { primary: config.PROVIDER_PRIMARY, fallback: config.PROVIDER_FALLBACK },
    breaker: providerBreaker,
    http: providerHttp,
    downloadMaxBytes: config.PROVIDER_DOWNLOAD_MAX_BYTES,
    logger: logger.child({ component: 'providers' }),
  });

  const app: AppContext<AppPrismaClient> = {
    config: config as AppContext['config'],
    logger,
    db: prisma,
    bus,
    scheduler,
    rateLimit,
    registry,
    adapters,
    providers,
  };

  bus.bindApp(app);
  const router = createRouter(app);

  const shutdownTasks: Array<() => Promise<void> | void> = [];

  let waAdapter: WaAdapter | null = null;
  let teleAdapter: TeleAdapter | null = null;

  if (config.WA_ENABLED) {
    waAdapter = createWaAdapter({
      app,
      prisma,
      onMessage: (ctx: MessageCtx) => router.dispatch(ctx),
    });
    adapters.register(waAdapter);
  }

  if (config.TELE_ENABLED) {
    teleAdapter = createTeleAdapter({
      app,
      onMessage: (ctx: MessageCtx) => router.dispatch(ctx),
    });
    adapters.register(teleAdapter);
  }

  if (options.loadFeatures !== false) {
    await loadFeatures(app);
  }

  scheduler.start();
  shutdownTasks.push(() => scheduler.stop());

  if (options.startAdapters !== false) {
    if (waAdapter) await waAdapter.start();
    if (teleAdapter) await teleAdapter.start();
  }

  await scheduler.catchup();

  logger.info(
    { status: 'ok', bootMs: Math.round(performance.now() - startedAt) },
    'Bot bootstrap complete',
  );

  return {
    app,
    router,
    scheduler,
    prisma,
    adapters: { wa: waAdapter, tele: teleAdapter },
    shutdownTasks,
  };
}