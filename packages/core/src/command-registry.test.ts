import type { Command, Feature } from '@bot/contracts';
import { describe, expect, it, vi } from 'vitest';
import { CommandConflictError } from './errors.js';
import { CommandRegistryImpl } from './command-registry.js';

function command(name: string, aliases: string[] = []): Command {
  return { name, aliases, description: `${name} command`, handler: vi.fn() };
}

function feature(name: string, commands: Command[]): Feature {
  return { name, version: '1.0.0', commands };
}

describe('CommandRegistryImpl', () => {
  it('resolves command names and aliases case-insensitively', () => {
    const registry = new CommandRegistryImpl();
    registry.register(feature('general/ping', [command('ping', ['p'])]), 'general');

    expect(registry.resolve('PING')?.command.name).toBe('ping');
    expect(registry.resolve('P')?.feature.name).toBe('general/ping');
  });

  it('rejects duplicate command and alias names', () => {
    const registry = new CommandRegistryImpl();
    registry.register(feature('general/ping', [command('ping', ['p'])]), 'general');

    expect(() =>
      registry.register(feature('general/other', [command('other', ['PING'])]), 'general'),
    ).toThrow(CommandConflictError);
    expect(() => registry.register(feature('general/ping2', [command('p')]), 'general')).toThrow(
      CommandConflictError,
    );
  });

  it('lists commands by category', () => {
    const registry = new CommandRegistryImpl();
    registry.register(feature('general/ping', [command('ping')]), 'general');
    registry.register(feature('owner/stats', [command('stats')]), 'owner');

    expect(registry.list()).toHaveLength(2);
    expect(registry.byCategory().general.map((item) => item.command.name)).toEqual(['ping']);
    expect(registry.byCategory().owner.map((item) => item.command.name)).toEqual(['stats']);
    expect(registry.byCategory().group).toEqual([]);
  });
});
