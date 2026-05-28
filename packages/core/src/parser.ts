import yargsParser from 'yargs-parser';

export type ParsedFlag = string | boolean | number;

export interface ParsedInput {
  prefix: '/' | '.';
  command: string;
  rawArgs: string;
  args: string[];
  flags: Record<string, ParsedFlag>;
}

const commandPattern = /^([/.])(\S+)\s*(.*)$/;
const ignoredParserKeys = new Set(['_', '$0', '--']);

function toFlagValue(value: unknown): ParsedFlag | undefined {
  if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number')
    return value;
  return undefined;
}

export function parseInput(text: string): ParsedInput | null {
  const match = commandPattern.exec(text.trim());
  if (!match) return null;

  const prefix = match[1] as ParsedInput['prefix'];
  const command = match[2];
  const rawArgs = match[3] ?? '';
  if (!command) return null;

  const parsed = yargsParser(rawArgs, {
    configuration: {
      'camel-case-expansion': false,
      'dot-notation': false,
      'duplicate-arguments-array': false,
      'parse-numbers': true,
      'parse-positional-numbers': true,
    },
  });

  const flags: Record<string, ParsedFlag> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (ignoredParserKeys.has(key)) continue;
    const flag = toFlagValue(value);
    if (flag !== undefined) flags[key] = flag;
  }

  return {
    prefix,
    command: command.toLowerCase(),
    rawArgs,
    args: parsed._.map((arg) => String(arg)),
    flags,
  };
}
