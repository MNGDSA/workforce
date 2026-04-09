import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const ENCRYPTION_KEY_STORE = 'workforce_db_key';
const KEY_LENGTH = 32;

let cachedKey: Uint8Array | null = null;

async function getOrCreateKey(): Promise<Uint8Array> {
  if (cachedKey) return cachedKey;

  const stored = await SecureStore.getItemAsync(ENCRYPTION_KEY_STORE);
  if (stored) {
    cachedKey = new Uint8Array(JSON.parse(stored));
    return cachedKey;
  }

  const key = await Crypto.getRandomBytesAsync(KEY_LENGTH);
  await SecureStore.setItemAsync(ENCRYPTION_KEY_STORE, JSON.stringify(Array.from(key)));
  cachedKey = key;
  return key;
}

function xorCipher(data: Uint8Array, key: Uint8Array): Uint8Array {
  const result = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ key[i % key.length];
  }
  return result;
}

function textToBytes(text: string): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(text);
}

function bytesToText(bytes: Uint8Array): string {
  const decoder = new TextDecoder();
  return decoder.decode(bytes);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function encryptField(plaintext: string): Promise<string> {
  const key = await getOrCreateKey();
  const iv = await Crypto.getRandomBytesAsync(16);
  const dataBytes = textToBytes(plaintext);
  const encrypted = xorCipher(dataBytes, new Uint8Array([...iv, ...key]));
  const ivBase64 = bytesToBase64(iv);
  const dataBase64 = bytesToBase64(encrypted);
  return `${ivBase64}:${dataBase64}`;
}

export async function decryptField(ciphertext: string): Promise<string> {
  const key = await getOrCreateKey();
  const [ivBase64, dataBase64] = ciphertext.split(':');
  if (!ivBase64 || !dataBase64) return ciphertext;
  const iv = base64ToBytes(ivBase64);
  const encrypted = base64ToBytes(dataBase64);
  const decrypted = xorCipher(encrypted, new Uint8Array([...iv, ...key]));
  return bytesToText(decrypted);
}

export async function clearEncryptionKey(): Promise<void> {
  cachedKey = null;
  await SecureStore.deleteItemAsync(ENCRYPTION_KEY_STORE);
}
