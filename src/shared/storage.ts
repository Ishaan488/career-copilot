import { resolve, normalize, dirname } from 'node:path';
import { promises as fs, createReadStream, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { AppError } from './errors';
import { config } from './config';

export interface StorageResult {
  size: number;
  sha256: string;
}

export class FileStorage {
  private readonly rootDir: string;

  constructor(rootDir?: string) {
    this.rootDir = resolve(process.cwd(), rootDir || config.DATA_DIR);
  }

  private resolveSafe(relativePath: string): string {
    const normalized = normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
    const absolute = resolve(this.rootDir, normalized);
    if (!absolute.startsWith(this.rootDir)) {
      throw new AppError('FORBIDDEN', 'Path traversal detected in file storage operation', {
        details: { relativePath },
      });
    }
    return absolute;
  }

  async put(relativePath: string, content: Buffer | Uint8Array | string): Promise<StorageResult> {
    const fullPath = this.resolveSafe(relativePath);
    await fs.mkdir(dirname(fullPath), { recursive: true });

    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const hash = createHash('sha256').update(buffer).digest('hex');

    await fs.writeFile(fullPath, buffer);
    return { size: buffer.length, sha256: hash };
  }

  async get(relativePath: string): Promise<Buffer> {
    const fullPath = this.resolveSafe(relativePath);
    try {
      return await fs.readFile(fullPath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new AppError('NOT_FOUND', `File not found: ${relativePath}`, { details: { relativePath } });
      }
      throw err;
    }
  }

  async exists(relativePath: string): Promise<boolean> {
    const fullPath = this.resolveSafe(relativePath);
    return existsSync(fullPath);
  }

  async delete(relativePath: string): Promise<void> {
    const fullPath = this.resolveSafe(relativePath);
    try {
      await fs.unlink(fullPath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }

  getStream(relativePath: string) {
    const fullPath = this.resolveSafe(relativePath);
    if (!existsSync(fullPath)) {
      throw new AppError('NOT_FOUND', `File not found: ${relativePath}`, { details: { relativePath } });
    }
    return createReadStream(fullPath);
  }

  getAbsolutePath(relativePath: string): string {
    return this.resolveSafe(relativePath);
  }
}

export const storage = new FileStorage();
