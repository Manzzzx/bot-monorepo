import { Buffer } from 'node:buffer';
import {
  BufferJSON,
  initAuthCreds,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataTypeMap,
} from '@whiskeysockets/baileys';
import { decryptJson, encryptJson } from '@bot/utils';
import type { AppPrismaClient } from '@bot/db';

type SignalKeyType = keyof SignalDataTypeMap;
type SignalValue = SignalDataTypeMap[SignalKeyType];

interface StoredKeys {
  [type: string]: { [id: string]: unknown };
}

interface StoredState {
  creds: AuthenticationCreds;
  keys: StoredKeys;
}

export interface PrismaAuthStateOptions {
  prisma: AppPrismaClient;
  encryptionKey: string;
  rowId?: string;
}

export interface PrismaAuthStateHandle {
  state: AuthenticationState;
  saveCreds(): Promise<void>;
  reset(): Promise<void>;
}

function reviveBuffers<T>(value: T): T {
  return JSON.parse(JSON.stringify(value), BufferJSON.reviver) as T;
}

function plainifyBuffers<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, BufferJSON.replacer)) as T;
}

export async function makePrismaAuthState(
  options: PrismaAuthStateOptions,
): Promise<PrismaAuthStateHandle> {
  const id = options.rowId ?? 'default';
  const prisma = options.prisma as unknown as {
    wAAuthState: {
      findUnique(args: { where: { id: string } }): Promise<{
        encryptedBlob: Buffer;
        iv: Buffer;
        authTag: Buffer;
      } | null>;
      upsert(args: {
        where: { id: string };
        create: { id: string; encryptedBlob: Buffer; iv: Buffer; authTag: Buffer };
        update: { encryptedBlob: Buffer; iv: Buffer; authTag: Buffer };
      }): Promise<unknown>;
      delete(args: { where: { id: string } }): Promise<unknown>;
    };
  };

  async function load(): Promise<StoredState> {
    const row = await prisma.wAAuthState.findUnique({ where: { id } });
    if (!row) return { creds: initAuthCreds(), keys: {} };
    const decrypted = decryptJson<unknown>(
      {
        encryptedBlob: Buffer.from(row.encryptedBlob).toString('hex'),
        iv: Buffer.from(row.iv).toString('hex'),
        authTag: Buffer.from(row.authTag).toString('hex'),
      },
      options.encryptionKey,
    );
    return reviveBuffers(decrypted) as StoredState;
  }

  async function persist(current: StoredState): Promise<void> {
    const safe = plainifyBuffers(current);
    const payload = encryptJson(safe, options.encryptionKey);
    const encryptedBlob = Buffer.from(payload.encryptedBlob, 'hex');
    const iv = Buffer.from(payload.iv, 'hex');
    const authTag = Buffer.from(payload.authTag, 'hex');
    await prisma.wAAuthState.upsert({
      where: { id },
      create: { id, encryptedBlob, iv, authTag },
      update: { encryptedBlob, iv, authTag },
    });
  }

  const stored = await load();

  const state: AuthenticationState = {
    creds: stored.creds,
    keys: {
      get: async (type, ids) => {
        const out: { [identifier: string]: SignalValue } = {};
        const bucket = stored.keys[type] ?? {};
        for (const identifier of ids) {
          const value = bucket[identifier];
          if (value !== undefined && value !== null) {
            out[identifier] = value as SignalValue;
          }
        }
        return out as { [identifier: string]: SignalDataTypeMap[typeof type] };
      },
      set: async (data) => {
        for (const [type, byId] of Object.entries(data)) {
          if (!byId) continue;
          const bucket = stored.keys[type] ?? {};
          for (const [identifier, value] of Object.entries(byId)) {
            if (value === null) delete bucket[identifier];
            else bucket[identifier] = value as unknown;
          }
          stored.keys[type] = bucket;
        }
        await persist(stored);
      },
    },
  };

  return {
    state,
    saveCreds: async () => {
      stored.creds = state.creds;
      await persist(stored);
    },
    reset: async () => {
      try {
        await prisma.wAAuthState.delete({ where: { id } });
      } catch {
        // noop when row missing
      }
    },
  };
}
