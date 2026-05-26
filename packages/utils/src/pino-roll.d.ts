declare module 'pino-roll' {
  import type { Writable } from 'node:stream';
  interface PinoRollOptions {
    file: string;
    frequency?: 'daily' | 'hourly' | number;
    size?: string;
    mkdir?: boolean;
    limit?: { count?: number; removeOtherLogFiles?: boolean };
    extension?: string;
    dateFormat?: string;
    symlink?: boolean;
    fsync?: boolean;
  }
  function pinoRoll(opts: PinoRollOptions): Promise<Writable>;
  export default pinoRoll;
}