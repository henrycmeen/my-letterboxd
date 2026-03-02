import { promises as fs } from 'node:fs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { getBoardState } from '@/lib/floorBoard';
import { hasTmdbApiKey } from '@/lib/tmdb';
import {
  TMDB_CACHE_ROOT,
  VHS_RENDER_CACHE_DIRECTORY,
  CLUB_DATA_DIRECTORY,
} from '@/lib/storagePaths';

type HealthStatus = 'ok' | 'degraded' | 'error';

interface HealthResponse {
  status: HealthStatus;
  generatedAt: string;
  checks: {
    sqlite: boolean;
    cacheDirectories: boolean;
    tmdbConfigured: boolean;
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<HealthResponse | { message: string }>
): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ message: 'Method not allowed' });
    return;
  }

  let sqliteOk = false;
  let cacheDirectoriesOk = false;
  const tmdbConfigured = hasTmdbApiKey();

  try {
    await getBoardState('default');
    sqliteOk = true;
  } catch {
    sqliteOk = false;
  }

  try {
    await fs.mkdir(CLUB_DATA_DIRECTORY, { recursive: true });
    await fs.mkdir(TMDB_CACHE_ROOT, { recursive: true });
    await fs.mkdir(VHS_RENDER_CACHE_DIRECTORY, { recursive: true });
    cacheDirectoriesOk = true;
  } catch {
    cacheDirectoriesOk = false;
  }

  const status: HealthStatus =
    sqliteOk && cacheDirectoriesOk
      ? tmdbConfigured
        ? 'ok'
        : 'degraded'
      : 'error';

  const response: HealthResponse = {
    status,
    generatedAt: new Date().toISOString(),
    checks: {
      sqlite: sqliteOk,
      cacheDirectories: cacheDirectoriesOk,
      tmdbConfigured,
    },
  };

  const httpCode = status === 'error' ? 500 : 200;
  res.status(httpCode).json(response);
}
