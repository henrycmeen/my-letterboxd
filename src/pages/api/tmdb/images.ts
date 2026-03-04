import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { applyRateLimit } from '@/lib/rateLimit';
import { getTmdbMovieImages, hasTmdbApiKey } from '@/lib/tmdb';

const querySchema = z.object({
  movieId: z.number().int().positive(),
  limit: z.number().int().min(1).max(60).default(24),
});

const getQueryValue = (
  value: string | string[] | undefined
): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
};

const parseOptionalNumber = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return parsed;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  if (
    !applyRateLimit(req, res, {
      key: 'tmdb-images',
      maxRequests: 120,
      windowMs: 60_000,
    })
  ) {
    return;
  }

  if (!hasTmdbApiKey()) {
    return res.status(500).json({
      message:
        'TMDB API access mangler i .env. Legg inn TMDB_API_KEY eller TMDB_READ_ACCESS_TOKEN.',
    });
  }

  const parsedQuery = querySchema.safeParse({
    movieId: parseOptionalNumber(getQueryValue(req.query.movieId)),
    limit: Number(getQueryValue(req.query.limit) ?? 24),
  });

  if (!parsedQuery.success) {
    return res.status(400).json({
      message: 'Invalid query params.',
      issues: parsedQuery.error.issues,
    });
  }

  try {
    const images = await getTmdbMovieImages(
      parsedQuery.data.movieId,
      parsedQuery.data.limit
    );

    return res.status(200).json({
      movieId: parsedQuery.data.movieId,
      posters: images.posters,
      backdrops: images.backdrops,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected TMDB images error';
    return res.status(500).json({ message });
  }
}
