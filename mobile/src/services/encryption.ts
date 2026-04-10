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

async function computeHmac(keyHex: string, data: string): Promise<string> {
  const innerPad = keyHex + ':inner:' + data;
  const innerHash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    innerPad
  );
  const outerPad = keyHex + ':outer:' + innerHash;
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    outerPad
  );
}

function uint8ToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const binaryString = atob(b64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function encryptFile(sourcePath: string, destPath: string): Promise<void> {
  const keyHex = await getOrCreateKeyHex();
  const content = await FileSystem.readAsStringAsync(sourcePath, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const iv = await Crypto.getRandomBytesAsync(16);
  const keyStream = await deriveStreamKey(keyHex, iv);
  const dataBytes = base64ToUint8(content);
  const encrypted = streamCipher(dataBytes, keyStream);

  const ivHex = bytesToHex(iv);
  const encryptedBase64 = uint8ToBase64(encrypted);

  const hmac = await computeHmac(keyHex, ivHex + encryptedBase64);

  const combined = ivHex + '.' + encryptedBase64 + '.' + hmac;

  await FileSystem.writeAsStringAsync(destPath, combined, {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

export async function decryptFile(encryptedPath: string, destPath: string): Promise<void> {
  const keyHex = await getOrCreateKeyHex();
  const raw = await FileSystem.readAsStringAsync(encryptedPath, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const firstDot = raw.indexOf('.');
  const lastDot = raw.lastIndexOf('.');
  if (firstDot === -1 || lastDot === firstDot) throw new Error('Invalid encrypted file format');

  const ivHex = raw.substring(0, firstDot);
  const encryptedBase64 = raw.substring(firstDot + 1, lastDot);
  const storedHmac = raw.substring(lastDot + 1);

  const expectedHmac = await computeHmac(keyHex, ivHex + encryptedBase64);
  if (storedHmac !== expectedHmac) {
    throw new Error('File integrity check failed: data may have been tampered with');
  }

  const iv = hexToBytes(ivHex);
  const keyStream = await deriveStreamKey(keyHex, iv);
  const encrypted = base64ToUint8(encryptedBase64);
  const decrypted = streamCipher(encrypted, keyStream);
  const decryptedBase64 = uint8ToBase64(decrypted);

  await FileSystem.writeAsStringAsync(destPath, decryptedBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

export async function clearEncryptionKey(): Promise<void> {
  cachedKeyHex = null;
  await SecureStore.deleteItemAsync(ENCRYPTION_KEY_STORE);
}
