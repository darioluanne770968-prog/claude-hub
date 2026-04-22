/**
 * End-to-End Encryption for Claude Hub Desktop
 * Uses Node.js crypto module for encryption/decryption
 */

import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const PBKDF2_ITERATIONS = 100000;

/**
 * Derive an encryption key from a password using PBKDF2
 */
export function deriveEncryptionKey(password: string, salt: string): string {
  const key = crypto.pbkdf2Sync(
    password,
    salt,
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    'sha256'
  );
  return key.toString('hex');
}

/**
 * Generate a random salt
 */
export function generateSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Encrypt data using AES-256-CBC
 */
export function encrypt(data: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Return IV + encrypted data
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt data using AES-256-CBC
 */
export function decrypt(encryptedData: string, keyHex: string): string {
  const [ivHex, encrypted] = encryptedData.split(':');

  if (!ivHex || !encrypted) {
    throw new Error('Invalid encrypted data format');
  }

  const key = Buffer.from(keyHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Encrypt an object (converts to JSON first)
 */
export function encryptObject<T>(data: T, keyHex: string): string {
  const json = JSON.stringify(data);
  return encrypt(json, keyHex);
}

/**
 * Decrypt to an object
 */
export function decryptObject<T>(encryptedData: string, keyHex: string): T {
  const json = decrypt(encryptedData, keyHex);
  return JSON.parse(json) as T;
}

/**
 * Hash data using SHA-256
 */
export function hash(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}
