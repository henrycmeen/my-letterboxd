import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import type { TmdbTitleQuery } from '@/lib/tmdb';
import { hasTmdbApiKey } from '@/lib/tmdb';
import { syncFrontSideVhsCovers, type VhsRenderer } from '@/lib/vhs/covers';

const listTypes = ['popular', 'top_rated', 'upcoming', 'now_playing'] as const;
const renderers = ['sharp', 'photoshop'] as const;
const formats = ['png', 'webp'] as const;

const querySchema = z.object({
  listType: z.enum(listTypes).default('popular'),
  limit: z.number().int().min(1).max(20).default(8),
  force: z.boolean().default(false),
  format: z.enum(formats).default('webp'),
  renderer: z.enum(renderers).default('sharp'),
  templateId: z.string().min(1).optional(),
  smartObjectLayerName: z.string().min(1).optional(),
  titles: z.string().optional(),
});

const getQueryValue = (
  value: string | string[] | undefined
): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
};

const parseBoolean = (value: string | undefined): boolean => {
  if (!value) {
    return false;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const parseTitleQueries = (value: string | undefined): TmdbTitleQuery[] => {
  if (!value) {
    return [];
  }

  return value
    .split('|')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const parts = entry.split('::').map((part) => part.trim());
      const titleRaw = parts[0] ?? '';
      const yearRaw = parts[1];
      const year = yearRaw ? Number(yearRaw) : undefined;

      return {
        title: titleRaw,
        year: Number.isFinite(year) ? year : undefined,
      };
    })
    .filter((query) => query.title.length > 0);
};

const getDefaultRenderer = (): VhsRenderer => {
  const configured = process.env.VHS_RENDERER?.trim().toLowerCase();
  if (configured === 'photoshop') {
    return 'photoshop';
  }

  return 'sharp';
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  if (!hasTmdbApiKey()) {
    return res.status(500).json({
      message:
        'TMDB_API_KEY mangler i .env. Legg inn token og restart dev-serveren.',
    });
  }

  const parsedQuery = querySchema.safeParse({
    listType: getQueryValue(req.query.listType),
    limit: Number(getQueryValue(req.query.limit) ?? 8),
    force: parseBoolean(getQueryValue(req.query.force)),
    format: getQueryValue(req.query.format),
    renderer: getQueryValue(req.query.renderer) ?? getDefaultRenderer(),
    templateId: getQueryValue(req.query.templateId),
    smartObjectLayerName: getQueryValue(req.query.smartObjectLayerName),
    titles: getQueryValue(req.query.titles),
  });

  if (!parsedQuery.success) {
    return res.status(400).json({
      message: 'Invalid query params.',
      issues: parsedQuery.error.issues,
    });
  }

  try {
    const movies = await syncFrontSideVhsCovers({
      listType: parsedQuery.data.listType,
      titleQueries: parseTitleQueries(parsedQuery.data.titles),
      limit: parsedQuery.data.limit,
      force: parsedQuery.data.force,
      format: parsedQuery.data.format,
      renderer: parsedQuery.data.renderer,
      templateId: parsedQuery.data.templateId,
      smartObjectLayerName: parsedQuery.data.smartObjectLayerName,
      quality: 92,
    });

    return res.status(200).json({
      listType: parsedQuery.data.listType,
      renderer: parsedQuery.data.renderer,
      format: parsedQuery.data.format,
      customTitles: parseTitleQueries(parsedQuery.data.titles),
      limit: parsedQuery.data.limit,
      count: movies.length,
      movies,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected VHS cover error';

    return res.status(500).json({ message });
  }
}
