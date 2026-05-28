export type ProviderErrorKind =
  | 'timeout'
  | 'http'
  | 'parse'
  | 'validation'
  | 'unauthorized'
  | 'rate_limit'
  | 'circuit_open'
  | 'unsupported';

export interface ProviderErrorOptions {
  status?: number;
  cause?: unknown;
  detail?: string;
}

export class ProviderError extends Error {
  readonly provider: string;
  readonly endpoint: string;
  readonly kind: ProviderErrorKind;
  readonly status?: number;
  readonly detail?: string;

  constructor(
    provider: string,
    endpoint: string,
    kind: ProviderErrorKind,
    options: ProviderErrorOptions = {},
  ) {
    super(
      `[${provider}] ${endpoint}: ${kind}${
        options.status !== undefined ? ` (${options.status})` : ''
      }${options.detail ? ` - ${options.detail}` : ''}`,
      options.cause !== undefined ? { cause: options.cause } : undefined,
    );
    this.name = 'ProviderError';
    this.provider = provider;
    this.endpoint = endpoint;
    this.kind = kind;
    if (options.status !== undefined) this.status = options.status;
    if (options.detail !== undefined) this.detail = options.detail;
  }
}

export class ProviderUnavailableError extends Error {
  readonly service: string;
  readonly attempts: ProviderError[];

  constructor(service: string, attempts: ProviderError[]) {
    super(`Service '${service}' unavailable after ${attempts.length} attempt(s)`);
    this.name = 'ProviderUnavailableError';
    this.service = service;
    this.attempts = attempts;
  }
}

export function shouldCountAsFailure(error: unknown): boolean {
  if (!(error instanceof ProviderError)) return true;
  return ['timeout', 'http', 'rate_limit', 'parse'].includes(error.kind);
}
