import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { NextApiRequest, NextApiResponse } from 'next';
import { VHS_RENDER_CACHE_DIRECTORY } from '@/lib/storagePaths';

const VALID_FILE_NAME = /^[a-z0-9][a-z0-9._-]*$/i;

const getContentType = (fileName: string): string => {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === '.png') {
    return 'image/png';
  }
  if (extension === '.webp') {
    return 'image/webp';
  }
  if (extension === '.jpg' || extension === '.jpeg') {
    return 'image/jpeg';
  }

  return 'application/octet-stream';
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ message: 'Method not allowed' });
    return;
  }

  const fileNameRaw = req.query.fileName;
  const fileName = Array.isArray(fileNameRaw) ? fileNameRaw[0] : fileNameRaw;
  if (!fileName || !VALID_FILE_NAME.test(fileName)) {
    res.status(400).json({ message: 'Invalid file name.' });
    return;
  }

  const absolutePath = path.join(VHS_RENDER_CACHE_DIRECTORY, fileName);
  const normalized = path.normalize(absolutePath);
  const root = path.normalize(VHS_RENDER_CACHE_DIRECTORY + path.sep);

  if (!normalized.startsWith(root)) {
    res.status(400).json({ message: 'Invalid file path.' });
    return;
  }

  try {
    const fileBuffer = await fs.readFile(normalized);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Type', getContentType(fileName));
    res.status(200).send(fileBuffer);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      res.status(404).json({ message: 'Image not found.' });
      return;
    }

    res.status(500).json({ message: 'Failed to load generated image.' });
  }
}
