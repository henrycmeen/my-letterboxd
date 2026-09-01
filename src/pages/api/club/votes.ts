import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import filmVoteCatalogue from "@/data/filmVoteCatalogue.json";
import { normalizeClubSlug } from "@/lib/clubSlug";
import { getFilmVoteStore, type FilmVoteSnapshot } from "@/lib/filmVotes";
import {
  createDeviceIdentity,
  DEVICE_COOKIE_NAME,
  getOrCreateVoterSecret,
  parseDeviceIdentity,
  serializeDeviceCookie,
} from "@/lib/voterIdentity";

interface ApiError {
  error: {
    code: "INVALID_REQUEST" | "METHOD_NOT_ALLOWED" | "VOTING_UNAVAILABLE";
    message: string;
  };
}

type ApiResponse = FilmVoteSnapshot | ApiError;

const catalogueFilmIds = filmVoteCatalogue.map((film) => film.id);
const catalogueFilmIdSet = new Set(catalogueFilmIds);

const voteInputSchema = z
  .object({
    filmId: z.number().int().positive(),
    hasVoted: z.boolean().optional(),
  })
  .strict()
  .refine(({ filmId }) => catalogueFilmIdSet.has(filmId));

const getQueryValue = (
  value: string | string[] | undefined,
): string | undefined => (Array.isArray(value) ? value[0] : value);

const resolveBoardId = (req: NextApiRequest): string | null => {
  const requestedBoardId = getQueryValue(req.query.boardId);
  if (!requestedBoardId?.trim()) {
    return null;
  }

  const boardId = normalizeClubSlug(requestedBoardId);
  return boardId.length <= 64 ? boardId : null;
};

const votingUnavailable = (res: NextApiResponse<ApiResponse>): void =>
  res.status(503).json({
    error: {
      code: "VOTING_UNAVAILABLE",
      message: "Avstemningen er ikke tilgjengelig akkurat nå.",
    },
  });

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
) {
  res.setHeader("Cache-Control", "private, no-store");

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "Metoden er ikke tillatt.",
      },
    });
  }

  const boardId = resolveBoardId(req);
  if (!boardId) {
    return res.status(400).json({
      error: { code: "INVALID_REQUEST", message: "Ugyldig stemme." },
    });
  }

  try {
    const voterSecret = await getOrCreateVoterSecret();
    const existingVoterKey = parseDeviceIdentity(
      req.cookies?.[DEVICE_COOKIE_NAME],
      voterSecret,
    );
    const createdIdentity = existingVoterKey
      ? null
      : createDeviceIdentity(voterSecret);
    const voterKey = existingVoterKey ?? createdIdentity!.voterKey;
    if (createdIdentity) {
      res.setHeader(
        "Set-Cookie",
        serializeDeviceCookie(createdIdentity.cookieValue, {
          basePath: process.env.NEXT_PUBLIC_BASE_PATH,
          secure: process.env.NODE_ENV === "production",
        }),
      );
    }
    const store = getFilmVoteStore();

    if (req.method === "POST") {
      const parsedVote = voteInputSchema.safeParse(req.body);
      if (!parsedVote.success) {
        return res.status(400).json({
          error: { code: "INVALID_REQUEST", message: "Ugyldig stemme." },
        });
      }

      store.setVote(
        boardId,
        parsedVote.data.filmId,
        voterKey,
        parsedVote.data.hasVoted ?? true,
      );
    }

    return res
      .status(200)
      .json(store.getSnapshot(boardId, voterKey, catalogueFilmIds));
  } catch {
    return votingUnavailable(res);
  }
}
