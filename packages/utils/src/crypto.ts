import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface EncryptedJsonPayload {
  encryptedBlob: string;
  iv: string;
  authTag: string;
}

function keyBuffer(hexKey: string): Buffer {
  if (!/^[a-f0-9]{64}$/.test(hexKey)) {
    throw new Error('AUTH_ENCRYPTION_KEY must be a 32-byte lowercase hex string');
  }

  return Buffer.from(hexKey, 'hex');
}

export function encryptJson(value: unknown, hexKey: string): EncryptedJsonPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBuffer(hexKey), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedBlob: encrypted.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

export function decryptJson<T>(payload: EncryptedJsonPayload, hexKey: string): T {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    keyBuffer(hexKey),
    Buffer.from(payload.iv, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, 'hex'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.encryptedBlob, 'hex')),
    decipher.final(),
  ]).toString('utf8');

  return JSON.parse(decrypted) as T;
}
