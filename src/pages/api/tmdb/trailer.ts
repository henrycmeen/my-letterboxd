import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rateLimit";
import { getTmdbMovieTrailerYoutubeId, hasTmdbApiKey } from "@/lib/tmdb";

const querySchema = z.object({
  movieId: z.coerce.number().int().positive(),
});

const getQueryValue = (
  value: string | string[] | undefined,
): string | undefined => (Array.isArray(value) ? value[0] : value);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  if (
    !applyRateLimit(req, res, {
      key: "tmdb-trailer",
      maxRequests: 120,
      windowMs: 60_000,
    })
  ) {
    return;
  }

  if (!hasTmdbApiKey()) {
    return res.status(200).json({ youtubeId: null });
  }

  const parsed = querySchema.safeParse({
    movieId: getQueryValue(req.query.movieId),
  });
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid movie id" });
  }

  try {
    const youtubeId = await getTmdbMovieTrailerYoutubeId(parsed.data.movieId);
    return res.status(200).json({ youtubeId });
  } catch {
    return res.status(200).json({ youtubeId: null });
  }
}
