export interface FilmPollCount {
  id: string;
  votes: number;
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
