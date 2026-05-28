import type { AppContext, Feature, FeatureCategory, Middleware } from '@bot/contracts';
import {
  FeatureConflictError,
  requireGroupAdmin,
  requireOwner,
  UnknownCategoryError,
} from '@bot/core';
import antiLinkFeature from './group/antilink.js';
import kickFeature from './group/kick.js';
import muteFeature from './group/mute.js';
import welcomeFeature from './group/welcome.js';
import helpFeature from './general/help.js';
import menuFeature from './general/menu.js';
import pingFeature from './general/ping.js';
import remindFeature from './general/remind/index.js';
import startFeature from './general/start.js';
import statsFeature from './general/stats.js';
import tiktokFeature from './downloader/tiktok.js';
import igdlFeature from './downloader/igdl.js';
import fbdlFeature from './downloader/fbdl.js';
import twitterFeature from './downloader/twitter.js';
import ytmp3Feature from './downloader/ytmp3.js';
import ytmp4Feature from './downloader/ytmp4.js';
import spotifyFeature from './downloader/spotify.js';
import pinterestFeature from './downloader/pinterest.js';
import sfileFeature from './downloader/sfile.js';
import igstalkFeature from './stalker/igstalk.js';
import ttstalkFeature from './stalker/ttstalk.js';
import ghstalkFeature from './stalker/ghstalk.js';
import twitterstalkFeature from './stalker/twitterstalk.js';
import threadsstalkFeature from './stalker/threadsstalk.js';
import pinstalkFeature from './stalker/pinstalk.js';
import ytstalkFeature from './stalker/ytstalk.js';
import robloxstalkFeature from './stalker/robloxstalk.js';
import fbstalkFeature from './stalker/fbstalk.js';
import ffstalkFeature from './stalker/ffstalk.js';
import mlstalkFeature from './stalker/mlstalk.js';
import pixivstalkFeature from './stalker/pixivstalk.js';
import wastalkFeature from './stalker/wastalk.js';
import broadcastFeature from './owner/broadcast.js';
import evalFeature from './owner/eval.js';
import shutdownFeature from './owner/shutdown.js';

type AutoGuardLabel = 'none' | 'requireOwner' | 'requireGroupAdmin';

export interface FeatureRegistryEntry {
  baseName: string;
  feature: Feature;
}

export type FeatureRegistry = Readonly<
  Partial<Record<FeatureCategory, readonly FeatureRegistryEntry[]>>
>;

export interface LoadFeaturesOptions {
  registry?: FeatureRegistry;
}

interface FeatureSource extends FeatureRegistryEntry {
  category: FeatureCategory;
}

type StaticFeatureRegistry = Readonly<Record<FeatureCategory, readonly FeatureRegistryEntry[]>>;

const featureCategories = [
  'general',
  'owner',
  'group',
  'downloader',
  'stalker',
] as const satisfies readonly FeatureCategory[];
const categories = new Set<string>(featureCategories);

export const staticFeatureRegistry = {
  general: [
    { baseName: 'help', feature: helpFeature },
    { baseName: 'menu', feature: menuFeature },
    { baseName: 'ping', feature: pingFeature },
    { baseName: 'remind', feature: remindFeature },
    { baseName: 'start', feature: startFeature },
    { baseName: 'stats', feature: statsFeature },
  ],
  owner: [
    { baseName: 'broadcast', feature: broadcastFeature },
    { baseName: 'eval', feature: evalFeature },
    { baseName: 'shutdown', feature: shutdownFeature },
  ],
  group: [
    { baseName: 'antilink', feature: antiLinkFeature },
    { baseName: 'kick', feature: kickFeature },
    { baseName: 'mute', feature: muteFeature },
    { baseName: 'welcome', feature: welcomeFeature },
  ],
  downloader: [
    { baseName: 'tiktok', feature: tiktokFeature },
    { baseName: 'igdl', feature: igdlFeature },
    { baseName: 'fbdl', feature: fbdlFeature },
    { baseName: 'twitter', feature: twitterFeature },
    { baseName: 'ytmp3', feature: ytmp3Feature },
    { baseName: 'ytmp4', feature: ytmp4Feature },
    { baseName: 'spotify', feature: spotifyFeature },
    { baseName: 'pinterest', feature: pinterestFeature },
    { baseName: 'sfile', feature: sfileFeature },
  ],
  stalker: [
    { baseName: 'igstalk', feature: igstalkFeature },
    { baseName: 'ttstalk', feature: ttstalkFeature },
    { baseName: 'ghstalk', feature: ghstalkFeature },
    { baseName: 'twitterstalk', feature: twitterstalkFeature },
    { baseName: 'threadsstalk', feature: threadsstalkFeature },
    { baseName: 'pinstalk', feature: pinstalkFeature },
    { baseName: 'ytstalk', feature: ytstalkFeature },
    { baseName: 'robloxstalk', feature: robloxstalkFeature },
    { baseName: 'fbstalk', feature: fbstalkFeature },
    { baseName: 'ffstalk', feature: ffstalkFeature },
    { baseName: 'mlstalk', feature: mlstalkFeature },
    { baseName: 'pixivstalk', feature: pixivstalkFeature },
    { baseName: 'wastalk', feature: wastalkFeature },
  ],
} as const satisfies StaticFeatureRegistry;

function isCategory(value: string): value is FeatureCategory {
  return categories.has(value);
}

function guardFor(category: FeatureCategory): { guards: Middleware[]; label: AutoGuardLabel } {
  if (category === 'owner') return { guards: [requireOwner()], label: 'requireOwner' };
  if (category === 'group') return { guards: [requireGroupAdmin()], label: 'requireGroupAdmin' };
  return { guards: [], label: 'none' };
}

function asFeature(value: unknown, source: string): Feature {
  if (typeof value !== 'object' || value === null)
    throw new TypeError(`Feature registry entry '${source}' did not contain a feature object.`);
  const feature = value as Partial<Feature>;
  if (typeof feature.name !== 'string' || typeof feature.version !== 'string') {
    throw new TypeError(`Feature registry entry '${source}' is missing name/version.`);
  }
  return feature as Feature;
}

function normalizeFeature(feature: Feature, source: FeatureSource): Feature {
  const autoGuards = guardFor(source.category);
  const normalized: Feature = {
    ...feature,
    name: `${source.category}/${source.baseName}`,
  };

  if (feature.commands) {
    normalized.commands = feature.commands.map((command) => ({
      ...command,
      category: command.category ?? source.category,
      guards: [...autoGuards.guards, ...(command.guards ?? [])],
    }));
  }

  return normalized;
}

function collectSources(registry: FeatureRegistry): FeatureSource[] {
  const sources = new Map<string, FeatureSource>();

  for (const [categoryName, entries] of Object.entries(registry)) {
    if (!isCategory(categoryName)) throw new UnknownCategoryError(categoryName);

    for (const entry of entries ?? []) {
      const sourceName = `${categoryName}/${entry.baseName}`;
      if (sources.has(sourceName)) throw new FeatureConflictError(sourceName);
      sources.set(sourceName, {
        category: categoryName,
        baseName: entry.baseName,
        feature: asFeature(entry.feature, sourceName),
      });
    }
  }

  return [...sources.values()].sort((left, right) =>
    `${left.category}/${left.baseName}`.localeCompare(`${right.category}/${right.baseName}`),
  );
}

export async function loadFeatures(
  app: AppContext,
  options: LoadFeaturesOptions = {},
): Promise<Feature[]> {
  const sources = collectSources(options.registry ?? staticFeatureRegistry);
  const loaded: Feature[] = [];

  for (const source of sources) {
    const autoGuard = guardFor(source.category).label;
    const feature = normalizeFeature(source.feature, source);
    app.registry.register(feature, source.category);

    for (const subscription of feature.events ?? []) {
      app.bus.on(subscription.event, subscription.handler as Parameters<typeof app.bus.on>[1]);
    }
    await feature.onLoad?.(app);

    app.logger.info(
      { feature: feature.name, category: source.category, source: 'static', autoGuard },
      `loaded feature ${feature.name} (auto-guard: ${autoGuard}) [static]`,
    );
    loaded.push(feature);
  }

  return loaded;
}
