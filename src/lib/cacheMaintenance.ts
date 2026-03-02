import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface CachePruneOptions {
  maxBytes: number;
  maxAgeMs: number;
  throttleMs?: number;
}

interface CacheFileEntry {
  absolutePath: string;
  size: number;
  mtimeMs: number;
}

interface CachePruneState {
  running: boolean;
  lastRunAt: number;
}

const pruneStateByDirectory = new Map<string, CachePruneState>();
const DEFAULT_THROTTLE_MS = 5 * 60 * 1000;

const toNonNegativeInt = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

const collectFilesRecursive = async (
  directory: string
): Promise<CacheFileEntry[]> => {
  let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;

  try {
    entries = await fs.readdir(directory, {
      withFileTypes: true,
      encoding: 'utf8',
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const output: CacheFileEntry[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectFilesRecursive(absolutePath);
      output.push(...nested);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    try {
      const stats = await fs.stat(absolutePath);
      output.push({
        absolutePath,
        size: stats.size,
        mtimeMs: stats.mtimeMs,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue;
      }
      throw error;
    }
  }

  return output;
};

const pruneDirectory = async (
  directory: string,
  options: CachePruneOptions
): Promise<void> => {
  const maxBytes = toNonNegativeInt(options.maxBytes);
  const maxAgeMs = toNonNegativeInt(options.maxAgeMs);
  const now = Date.now();
  const files = await collectFilesRecursive(directory);

  let totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const survivors: CacheFileEntry[] = [];

  for (const file of files) {
    const tooOld = maxAgeMs > 0 && now - file.mtimeMs > maxAgeMs;
    if (!tooOld) {
      survivors.push(file);
      continue;
    }

    await fs.rm(file.absolutePath, { force: true });
    totalBytes -= file.size;
  }

  if (maxBytes <= 0 || totalBytes <= maxBytes) {
    return;
  }

  const oldestFirst = [...survivors].sort((a, b) => a.mtimeMs - b.mtimeMs);
  for (const file of oldestFirst) {
    if (totalBytes <= maxBytes) {
      break;
    }

    await fs.rm(file.absolutePath, { force: true });
    totalBytes -= file.size;
  }
};

export const scheduleCachePrune = (
  directory: string,
  options: CachePruneOptions
): void => {
  const normalizedDirectory = path.normalize(directory);
  const throttleMs = toNonNegativeInt(options.throttleMs ?? DEFAULT_THROTTLE_MS);
  const now = Date.now();
  const current = pruneStateByDirectory.get(normalizedDirectory);

  if (current?.running) {
    return;
  }

  if (current && now - current.lastRunAt < throttleMs) {
    return;
  }

  pruneStateByDirectory.set(normalizedDirectory, {
    running: true,
    lastRunAt: now,
  });

  void (async () => {
    try {
      await pruneDirectory(normalizedDirectory, options);
    } catch {
      // Best effort only: cache cleanup should never break request flow.
    } finally {
      const state = pruneStateByDirectory.get(normalizedDirectory);
      if (!state) {
        return;
      }

      pruneStateByDirectory.set(normalizedDirectory, {
        running: false,
        lastRunAt: Date.now(),
      });
    }
  })();
};
