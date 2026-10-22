/**
 * File storage.
 *
 * The import pipeline keeps the uploaded CSV so that a preview can be re-run and a failed import
 * can be retried without asking the customer to upload the file again.
 *
 * Two implementations:
 * - `LocalFileStorage` — writes to a directory on disk. Used in development, CI and the E2E
 *   suite, and as the fallback when Supabase credentials are absent.
 * - `SupabaseFileStorage` — writes to a private Supabase Storage bucket. Used in production.
 *
 * The bucket is private: files are never publicly readable and are only ever served back to
 * their owning organization.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getEnv } from '../config/env.js';

export interface StoredFile {
  /** Storage key (path within the bucket or directory). */
  path: string;
  /** SHA-256 of the contents, used to detect identical uploads. */
  checksum: string;
  sizeBytes: number;
}

export interface FileStorage {
  store(key: string, content: Buffer): Promise<StoredFile>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

export function checksumOf(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Local disk implementation. */
export class LocalFileStorage implements FileStorage {
  private readonly root: string;

  constructor(root?: string) {
    this.root = root ?? resolve(process.cwd(), '.data', 'storage');
  }

  private resolveKey(key: string): string {
    // Reject path traversal: the key is generated server-side, but this is cheap insurance.
    if (key.includes('..') || key.startsWith('/')) {
      throw new Error('Invalid storage key.');
    }
    return join(this.root, key);
  }

  async store(key: string, content: Buffer): Promise<StoredFile> {
    const target = this.resolveKey(key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
    return { path: key, checksum: checksumOf(content), sizeBytes: content.length };
  }

  async read(key: string): Promise<Buffer> {
    return readFile(this.resolveKey(key));
  }

  async remove(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }
}

/** Supabase Storage implementation (production). */
export class SupabaseFileStorage implements FileStorage {
  private readonly client: SupabaseClient;
  private readonly bucket: string;

  constructor(bucket = 'salestrace-imports') {
    const env = getEnv();
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SupabaseFileStorage requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    }

    this.bucket = bucket;
    this.client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  async store(key: string, content: Buffer): Promise<StoredFile> {
    const { error } = await this.client.storage.from(this.bucket).upload(key, content, {
      upsert: true,
      contentType: 'text/csv',
    });
    if (error) {
      throw new Error(`Failed to store the import file: ${error.message}`);
    }
    return { path: key, checksum: checksumOf(content), sizeBytes: content.length };
  }

  async read(key: string): Promise<Buffer> {
    const { data, error } = await this.client.storage.from(this.bucket).download(key);
    if (error || data === null) {
      throw new Error('Failed to read the import file.');
    }
    return Buffer.from(await data.arrayBuffer());
  }

  async remove(key: string): Promise<void> {
    await this.client.storage.from(this.bucket).remove([key]);
  }
}

/** Build the storage implementation configured for the current environment. */
export function createFileStorage(): FileStorage {
  const env = getEnv();
  // Only use Supabase Storage in supabase mode; local development stores files on disk even if
  // placeholder Supabase values are left in the environment file.
  if (env.AUTH_MODE === 'supabase' && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    return new SupabaseFileStorage();
  }
  return new LocalFileStorage();
}
