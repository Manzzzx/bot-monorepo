import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const srcFiles = ['packages/**/src/**/*.ts', 'apps/**/src/**/*.ts'];

const noManualStdout = {
  object: 'process',
  property: 'stdout',
  message: 'Use root logger transport instead of process.stdout.',
};

const noManualStderr = {
  object: 'process',
  property: 'stderr',
  message: 'Use root logger transport instead of process.stderr.',
};

const noManualFsLogWrites = {
  paths: [
    {
      name: 'node:fs',
      importNames: ['appendFile', 'appendFileSync', 'createWriteStream'],
      message: 'Use root logger transport instead of manual log file writes.',
    },
  ],
};

export default [
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', '**/.turbo/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: srcFiles,
    rules: {
      'no-console': 'error',
      'no-restricted-properties': ['error', noManualStdout, noManualStderr],
      'no-restricted-imports': ['error', noManualFsLogWrites],
    },
  },
  {
    files: ['packages/utils/src/logger.ts', 'apps/bot/src/bootstrap.ts'],
    rules: {
      'no-console': 'off',
      'no-restricted-properties': 'off',
      'no-restricted-imports': 'off',
    },
  },
  {
    files: ['packages/features/src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'warn',
        {
          patterns: [
            {
              group: [
                '@bot/utils',
                '@bot/utils/*',
                '../../../utils/src/logger.js',
                '../../utils/src/logger.js',
              ],
              message: 'Features must use ctx.logger instead of importing the root logger.',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        noManualStdout,
        noManualStderr,
        {
          object: 'ctx',
          property: 'raw',
          message: 'Shared features must not access platform-specific raw payloads.',
        },
      ],
    },
  },
  {
    files: ['packages/features/src/**/tele.ts', 'packages/features/src/**/wa.ts'],
    rules: {
      'no-restricted-properties': ['error', noManualStdout, noManualStderr],
    },
  },
];
