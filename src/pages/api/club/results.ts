import type { NextApiRequest, NextApiResponse } from "next";
import filmVoteCatalogue from "@/data/filmVoteCatalogue.json";
import {
  getActiveVoteBoardId,
  getFilmClubProgramme,
  resolveCanonicalClubId,
} from "@/lib/filmClubProgramme";
import { getFilmVoteStore } from "@/lib/filmVotes";

const catalogueFilmIds = filmVoteCatalogue.map((film) => film.id);
const tieBreakScores = new Map(
  filmVoteCatalogue.map((film) => [film.id, film.tmdbVoteAverage]),
);
const filmById = new Map(filmVoteCatalogue.map((film) => [film.id, film]));

const getQueryValue = (
  value: string | string[] | undefined,
): string | undefined => (Array.isArray(value) ? value[0] : value);

export default function handler(req: NextApiRequest, res: NextApiResponse) {
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

  try {
    const requestedSlug = getQueryValue(req.query.clubSlug);
    const clubId = resolveCanonicalClubId(requestedSlug);
    const programme = getFilmClubProgramme(clubId);
    const boardId = getActiveVoteBoardId(clubId);
    const store = getFilmVoteStore();
    const lockedRound = store.getRoundSnapshot(boardId);
    const results = lockedRound
      ? {
          revision: lockedRound.revision,
          ranking: lockedRound.ranking.map((entry) => ({
            filmId: entry.film.id,
            votes: entry.votes,
          })),
          ...lockedRound.stats,
        }
      : store.getResults(boardId, catalogueFilmIds, tieBreakScores);

    const ranking = lockedRound
      ? lockedRound.ranking.map((entry, index) => ({
          rank: index + 1,
          filmId: entry.film.id,
          title: entry.film.title,
          coverImage: entry.film.coverImage,
          tmdbVoteAverage: entry.tmdbVoteAverage ?? 0,
          votes: entry.votes,
        }))
      : results.ranking.flatMap((entry, index) => {
          const film = filmById.get(entry.filmId);
          return film
            ? [
                {
                  rank: index + 1,
                  filmId: film.id,
                  title: film.title,
                  coverImage: film.coverImage,
                  tmdbVoteAverage: film.tmdbVoteAverage,
                  votes: entry.votes,
                },
              ]
            : [];
        });

    const history = programme.history.flatMap((entry) => {
      const winner = filmById.get(entry.winnerFilmId);
      return winner
        ? [
            {
              screeningId: entry.screeningId,
              scheduledAt: entry.scheduledAt,
              winner: {
                filmId: winner.id,
                title: winner.title,
                coverImage: winner.coverImage,
                votes: entry.finalVoteCount,
              },
              totalVotes: entry.totalVotes,
              participatingDevices: entry.participatingDevices,
            },
          ]
        : [];
    });

    return res.status(200).json({
      club: { id: clubId, name: programme.name },
      activeScreening: lockedRound
        ? { id: lockedRound.screeningId, scheduledAt: lockedRound.scheduledAt }
        : programme.activeScreening,
      ranking,
      stats: {
        totalVotes: results.totalVotes,
        participatingDevices: results.participatingDevices,
        lastVoteAt: results.lastVoteAt,
      },
      history,
      revision: results.revision,
      generatedAt: new Date().toISOString(),
    });
  } catch {
    return res.status(503).json({
      error: {
        code: "RESULTS_UNAVAILABLE",
        message: "Resultatene er ikke tilgjengelige akkurat nå.",
      },
    });
  }
}
