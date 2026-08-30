export interface FilmPollCount {
  id: string;
  votes: number;
}

export interface RankedFilmPollCount extends FilmPollCount {
  initialRank: number;
  lastVoteOrder: number;
}

export const applyFilmVote = (
  counts: FilmPollCount[],
  previousVote: string | null,
  nextVote: string,
): FilmPollCount[] => {
  if (previousVote === nextVote) {
    return counts;
  }

  return counts.map((entry) => {
    if (entry.id === previousVote) {
      return { ...entry, votes: Math.max(0, entry.votes - 1) };
    }

    if (entry.id === nextVote) {
      return { ...entry, votes: entry.votes + 1 };
    }

    return entry;
  });
};

export const rankFilmVotes = (
  counts: RankedFilmPollCount[],
): RankedFilmPollCount[] =>
  [...counts].sort(
    (first, second) =>
      second.votes - first.votes ||
      second.lastVoteOrder - first.lastVoteOrder ||
      first.initialRank - second.initialRank,
  );

export const applyRankedFilmVote = (
  counts: RankedFilmPollCount[],
  previousVote: string | null,
  nextVote: string,
  voteOrder: number,
): RankedFilmPollCount[] => {
  if (previousVote === nextVote) {
    return counts;
  }

  return rankFilmVotes(
    counts.map((entry) => {
      if (entry.id === previousVote) {
        return { ...entry, votes: Math.max(0, entry.votes - 1) };
      }

      if (entry.id === nextVote) {
        return {
          ...entry,
          votes: entry.votes + 1,
          lastVoteOrder: voteOrder,
        };
      }

      return entry;
    }),
  );
};
