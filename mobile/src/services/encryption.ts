import QuickCrypto from 'react-native-quick-crypto';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';

const ENCRYPTION_KEY_STORE = 'workforce_db_key';
const AES_KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

let cachedKey: Buffer | null = null;

async function getOrCreateKey(): Promise<Buffer> {
  if (cachedKey) return cachedKey;

  const stored = await SecureStore.getItemAsync(ENCRYPTION_KEY_STORE);
  if (stored) {
    cachedKey = Buffer.from(stored, 'base64');
    return cachedKey;
  }

  const keyBytes = QuickCrypto.randomBytes(AES_KEY_LENGTH);
  const keyBuffer = Buffer.from(keyBytes);
  await SecureStore.setItemAsync(ENCRYPTION_KEY_STORE, keyBuffer.toString('base64'));
  cachedKey = keyBuffer;
  return cachedKey;
}

export async function encryptField(plaintext: string): Promise<string> {
  const key = await getOrCreateKey();
  const iv = QuickCrypto.randomBytes(IV_LENGTH);
  const ivBuffer = Buffer.from(iv);

  const cipher = QuickCrypto.createCipheriv('aes-256-gcm', key, ivBuffer);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  const combined = Buffer.concat([ivBuffer, authTag, encrypted]);
  return combined.toString('base64');
}

export async function decryptField(ciphertext: string): Promise<string> {
  if (!ciphertext || ciphertext.length < 10) return ciphertext;

  try {
    const combined = Buffer.from(ciphertext, 'base64');
    if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) return ciphertext;

    const key = await getOrCreateKey();
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = QuickCrypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch {
    return ciphertext;
  }
}

export async function encryptFile(sourcePath: string, destPath: string): Promise<void> {
  const key = await getOrCreateKey();
  const content = await FileSystem.readAsStringAsync(sourcePath, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const dataBuffer = Buffer.from(content, 'base64');
  const iv = QuickCrypto.randomBytes(IV_LENGTH);
  const ivBuffer = Buffer.from(iv);

  const cipher = QuickCrypto.createCipheriv('aes-256-gcm', key, ivBuffer);
  const encrypted = Buffer.concat([
    cipher.update(dataBuffer),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  const combined = Buffer.concat([ivBuffer, authTag, encrypted]);
  const outputBase64 = combined.toString('base64');

  await FileSystem.writeAsStringAsync(destPath, outputBase64, {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

export async function decryptFile(encryptedPath: string, destPath: string): Promise<void> {
  const key = await getOrCreateKey();
  const raw = await FileSystem.readAsStringAsync(encryptedPath, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const combined = Buffer.from(raw, 'base64');
  if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Invalid encrypted file: too short');
  }

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = QuickCrypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  const decryptedBase64 = decrypted.toString('base64');

  await FileSystem.writeAsStringAsync(destPath, decryptedBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

export async function clearEncryptionKey(): Promise<void> {
  cachedKey = null;
  await SecureStore.deleteItemAsync(ENCRYPTION_KEY_STORE);
}
