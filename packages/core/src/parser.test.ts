import { describe, expect, it } from 'vitest';
import { parseInput } from './parser.js';

describe('parseInput', () => {
  it('parses slash commands without args', () => {
    expect(parseInput('/ping')).toEqual({
      prefix: '/',
      command: 'ping',
      rawArgs: '',
      args: [],
      flags: {},
    });
  });

  it('parses slash commands with positional args', () => {
    expect(parseInput('/help ping')).toMatchObject({
      prefix: '/',
      command: 'help',
      rawArgs: 'ping',
      args: ['ping'],
      flags: {},
    });
  });

  it('parses dot commands with flags and quoted values', () => {
    expect(parseInput('.broadcast --group "hello world"')).toMatchObject({
      prefix: '.',
      command: 'broadcast',
      rawArgs: '--group "hello world"',
      args: [],
      flags: { group: 'hello world' },
    });
  });

  it('rejects the legacy bang prefix', () => {
    expect(parseInput('!ping')).toBeNull();
  });

  it('returns null for non-command text', () => {
    expect(parseInput('hello bot')).toBeNull();
  });
});
