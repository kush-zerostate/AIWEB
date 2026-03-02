/**
 * Crypto utilities for encrypting/decrypting Figma OAuth tokens at rest.
 * Uses AES-256-GCM for authenticated encryption.
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function getEncryptionKey(): Buffer {
    const key = process.env.FIGMA_TOKEN_ENCRYPTION_KEY;
    if (!key) {
        throw new Error('FIGMA_TOKEN_ENCRYPTION_KEY not set. Generate with: openssl rand -hex 32');
    }
    return Buffer.from(key, 'hex');
}

/**
 * Encrypt a plaintext string (e.g. access token).
 * Returns format: iv:authTag:ciphertext (all hex encoded)
 */
export function encryptToken(plaintext: string): string {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a previously encrypted token string.
 */
export function decryptToken(ciphertext: string): string {
    const key = getEncryptionKey();
    const [ivHex, authTagHex, encrypted] = ciphertext.split(':');

    if (!ivHex || !authTagHex || !encrypted) {
        throw new Error('Invalid encrypted token format');
    }

    const decipher = crypto.createDecipheriv(
        ALGORITHM,
        key,
        Buffer.from(ivHex, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
