import type { CommandRegistry, Feature, FeatureCategory, RegisteredCommand } from '@bot/contracts';
import { CommandConflictError } from './errors.js';

function normalizeKey(name: string): string {
  return name.trim().toLowerCase();
}

function makeFullName(feature: Feature, commandName: string): string {
  return `${feature.name}:${commandName}`;
}

function emptyCategories(): Record<FeatureCategory, RegisteredCommand[]> {
  return { general: [], owner: [], group: [] };
}

export class CommandRegistryImpl implements CommandRegistry {
  private readonly commands = new Map<string, RegisteredCommand>();
  private readonly entries: RegisteredCommand[] = [];

  register(feature: Feature, category: FeatureCategory): void {
    for (const command of feature.commands ?? []) {
      const registered: RegisteredCommand = {
        command,
        feature,
        category,
        fullName: makeFullName(feature, command.name),
      };
      const keys = [command.name, ...(command.aliases ?? [])].map(normalizeKey);

      for (const key of keys) {
        const existing = this.commands.get(key);
        if (existing) throw new CommandConflictError(key, existing.fullName);
      }

      this.entries.push(registered);
      for (const key of keys) this.commands.set(key, registered);
    }
  }

  resolve(name: string): RegisteredCommand | null {
    return this.commands.get(normalizeKey(name)) ?? null;
  }

  list(): RegisteredCommand[] {
    return [...this.entries];
  }

  byCategory(): Record<FeatureCategory, RegisteredCommand[]> {
    const grouped = emptyCategories();
    for (const entry of this.entries) grouped[entry.category].push(entry);
    return grouped;
  }
}
