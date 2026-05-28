import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: '@app/bot',
      root: './apps/bot',
      include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
      setupFiles: ['../../vitest.setup.ts'],
      exclude: ['dist/**', 'node_modules/**'],
    },
  },
  {
    test: {
      name: '@app/wa',
      root: './apps/wa',
      include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
      setupFiles: ['../../vitest.setup.ts'],
      exclude: ['dist/**', 'node_modules/**'],
    },
  },
  {
    test: {
      name: '@app/tele',
      root: './apps/tele',
      include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
      setupFiles: ['../../vitest.setup.ts'],
      exclude: ['dist/**', 'node_modules/**'],
    },
  },
  {
    test: {
      name: '@bot/contracts',
      root: './packages/contracts',
      include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
      setupFiles: ['../../vitest.setup.ts'],
      exclude: ['dist/**', 'node_modules/**'],
    },
  },
  {
    test: {
      name: '@bot/core',
      root: './packages/core',
      include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
      setupFiles: ['../../vitest.setup.ts'],
      exclude: ['dist/**', 'node_modules/**'],
    },
  },
  {
    test: {
      name: '@bot/adapters',
      root: './packages/adapters',
      include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
      setupFiles: ['../../vitest.setup.ts'],
      exclude: ['dist/**', 'node_modules/**'],
    },
  },
  {
    test: {
      name: '@bot/db',
      root: './packages/db',
      include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
      setupFiles: ['../../vitest.setup.ts'],
      exclude: ['dist/**', 'node_modules/**'],
    },
  },
  {
    test: {
      name: '@bot/features',
      root: './packages/features',
      include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
      setupFiles: ['../../vitest.setup.ts'],
      exclude: ['dist/**', 'node_modules/**'],
    },
  },
  {
    test: {
      name: '@bot/utils',
      root: './packages/utils',
      include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
      setupFiles: ['../../vitest.setup.ts'],
      exclude: ['dist/**', 'node_modules/**'],
    },
  },
]);
