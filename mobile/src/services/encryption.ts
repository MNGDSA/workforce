import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';

const ENCRYPTION_KEY_STORE = 'workforce_db_key';

let cachedKeyHex: string | null = null;

async function getOrCreateKeyHex(): Promise<string> {
  if (cachedKeyHex) return cachedKeyHex;

  const stored = await SecureStore.getItemAsync(ENCRYPTION_KEY_STORE);
  if (stored) {
    cachedKeyHex = stored;
    return cachedKeyHex;
  }

  const keyBytes = await Crypto.getRandomBytesAsync(32);
  const hex = Array.from(keyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  await SecureStore.setItemAsync(ENCRYPTION_KEY_STORE, hex);
  cachedKeyHex = hex;
  return cachedKeyHex;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function deriveStreamKey(keyHex: string, iv: Uint8Array): Promise<Uint8Array> {
  const combined = keyHex + bytesToHex(iv);
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    combined
  );
  return hexToBytes(hash);
}

function streamCipher(data: Uint8Array, keyStream: Uint8Array): Uint8Array {
  const result = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ keyStream[i % keyStream.length];
  }
  return result;
}

export async function encryptField(plaintext: string): Promise<string> {
  const keyHex = await getOrCreateKeyHex();
  const iv = await Crypto.getRandomBytesAsync(16);
  const keyStream = await deriveStreamKey(keyHex, iv);
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(plaintext);
  const encrypted = streamCipher(dataBytes, keyStream);

  const ivHex = bytesToHex(iv);
  const dataHex = bytesToHex(encrypted);

  const hmacInput = ivHex + dataHex;
  const hmac = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    keyHex + hmacInput
  );

  return `${ivHex}:${dataHex}:${hmac}`;
}

export async function decryptField(ciphertext: string): Promise<string> {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) return ciphertext;

  const [ivHex, dataHex, storedHmac] = parts;
  const keyHex = await getOrCreateKeyHex();

  const hmacInput = ivHex + dataHex;
  const expectedHmac = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    keyHex + hmacInput
  );

  if (storedHmac !== expectedHmac) {
    throw new Error('Integrity check failed: data may have been tampered with');
  }

  const iv = hexToBytes(ivHex);
  const encrypted = hexToBytes(dataHex);
  const keyStream = await deriveStreamKey(keyHex, iv);
  const decrypted = streamCipher(encrypted, keyStream);
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

export async function encryptFile(sourcePath: string, destPath: string): Promise<void> {
  const keyHex = await getOrCreateKeyHex();
  const content = await FileSystem.readAsStringAsync(sourcePath, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const iv = await Crypto.getRandomBytesAsync(16);
  const keyStream = await deriveStreamKey(keyHex, iv);

  const binaryString = atob(content);
  const dataBytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    dataBytes[i] = binaryString.charCodeAt(i);
  }

  const encrypted = streamCipher(dataBytes, keyStream);
  const ivHex = bytesToHex(iv);
  const encryptedBase64 = btoa(String.fromCharCode(...encrypted));
  const combined = ivHex + '.' + encryptedBase64;

  await FileSystem.writeAsStringAsync(destPath, combined, {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

export async function decryptFile(encryptedPath: string, destPath: string): Promise<void> {
  const keyHex = await getOrCreateKeyHex();
  const raw = await FileSystem.readAsStringAsync(encryptedPath, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const dotIndex = raw.indexOf('.');
  if (dotIndex === -1) throw new Error('Invalid encrypted file format');

  const ivHex = raw.substring(0, dotIndex);
  const encryptedBase64 = raw.substring(dotIndex + 1);

  const iv = hexToBytes(ivHex);
  const keyStream = await deriveStreamKey(keyHex, iv);

  const binaryString = atob(encryptedBase64);
  const encrypted = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    encrypted[i] = binaryString.charCodeAt(i);
  }

  const decrypted = streamCipher(encrypted, keyStream);
  const decryptedBase64 = btoa(String.fromCharCode(...decrypted));

  await FileSystem.writeAsStringAsync(destPath, decryptedBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

export async function clearEncryptionKey(): Promise<void> {
  cachedKeyHex = null;
  await SecureStore.deleteItemAsync(ENCRYPTION_KEY_STORE);
}
