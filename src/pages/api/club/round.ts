import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rateLimit";
import {
  getFilmRoundBoardId,
  getCurrentFilmRound,
} from "@/lib/filmRoundService";
import { resolveCanonicalClubId } from "@/lib/filmClubProgramme";
import { getFilmVoteStore } from "@/lib/filmVotes";
import type { FilmRoundSnapshot } from "@/lib/filmRound";

const screeningIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9-]*$/);

const querySchema = z
  .object({
    clubSlug: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9][a-z0-9-]*$/i)
      .default("default"),
    screeningId: screeningIdSchema.optional(),
  })
  .strict();

interface OpenRoundResponse {
  status: "open";
  boardId: string;
}

interface ClosedRoundResponse {
  status: "closed";
  boardId: string;
  snapshot: FilmRoundSnapshot;
}

interface RoundErrorResponse {
  error: {
    code:
      | "INVALID_REQUEST"
      | "METHOD_NOT_ALLOWED"
      | "ROUND_NOT_FOUND"
      | "ROUND_UNAVAILABLE";
    message: string;
  };
}

type RoundResponse =
  | OpenRoundResponse
  | ClosedRoundResponse
  | RoundErrorResponse;

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<RoundResponse>,
) {
  res.setHeader("Cache-Control", "private, no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "Metoden er ikke tillatt.",
      },
    });
  }

  if (
    !applyRateLimit(req, res, {
      key: "club-round",
      maxRequests: 600,
      windowMs: 60_000,
    })
  ) {
    return;
  }

  const parsedQuery = querySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({
      error: {
        code: "INVALID_REQUEST",
        message: "Ugyldig runde.",
      },
    });
  }

  try {
    const clubId = resolveCanonicalClubId(parsedQuery.data.clubSlug);
    const current = getCurrentFilmRound(clubId);
    const screeningId = parsedQuery.data.screeningId ?? current.screeningId;
    const boardId = getFilmRoundBoardId(clubId, screeningId);
    const snapshot = getFilmVoteStore().getLockedRound(boardId);

    if (snapshot) {
      return res.status(200).json({ status: "closed", boardId, snapshot });
    }

    if (
      parsedQuery.data.screeningId &&
      parsedQuery.data.screeningId !== current.screeningId
    ) {
      return res.status(404).json({
        error: {
          code: "ROUND_NOT_FOUND",
          message: "Runden finnes ikke.",
        },
      });
    }

    return res.status(200).json({ status: "open", boardId });
  } catch {
    return res.status(503).json({
      error: {
        code: "ROUND_UNAVAILABLE",
        message: "Runden er ikke tilgjengelig akkurat nå.",
      },
    });
  }
}
