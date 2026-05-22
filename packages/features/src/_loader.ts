import type { AppContext, Feature, FeatureCategory, Middleware } from '@bot/contracts';
import { FeatureConflictError, requireGroup, requireOwner, UnknownCategoryError } from '@bot/core';
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
import broadcastFeature from './owner/broadcast.js';
import evalFeature from './owner/eval.js';
import shutdownFeature from './owner/shutdown.js';

type AutoGuardLabel = 'none' | 'requireOwner' | 'requireGroup+requireOwner';

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
} as const satisfies StaticFeatureRegistry;

function isCategory(value: string): value is FeatureCategory {
  return categories.has(value);
}

function guardFor(category: FeatureCategory): { guards: Middleware[]; label: AutoGuardLabel } {
  if (category === 'owner') return { guards: [requireOwner()], label: 'requireOwner' };
  if (category === 'group')
    return { guards: [requireGroup(), requireOwner()], label: 'requireGroup+requireOwner' };
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

    for (const subscription of feature.events ?? [])
      app.bus.on(subscription.event, subscription.handler);
    await feature.onLoad?.(app);

    app.logger.info(
      { feature: feature.name, category: source.category, source: 'static', autoGuard },
      `loaded feature ${feature.name} (auto-guard: ${autoGuard}) [static]`,
    );
    loaded.push(feature);
  }

  return loaded;
}
