import { useEffect, useState } from "react";
import {
  FALLBACK_NEXT_MOVIE,
  isLiveProgramResponse,
  mergeLiveNextMovie,
  type FilmProgramMovie,
} from "@/components/filmClubProgramData";
import { withBasePath } from "@/lib/basePath";

export const useClubNextMovie = (boardId: string): FilmProgramMovie => {
  const [movie, setMovie] = useState<FilmProgramMovie>(FALLBACK_NEXT_MOVIE);

  useEffect(() => {
    const controller = new AbortController();

    const loadNextMovie = async () => {
      try {
        const params = new URLSearchParams({ boardId });
        const response = await fetch(
          withBasePath(`/api/club/next?${params.toString()}`),
          { signal: controller.signal },
        );

        if (!response.ok) {
          return;
        }

        const payload: unknown = await response.json();
        if (!isLiveProgramResponse(payload) || !payload.now) {
          return;
        }

        setMovie(mergeLiveNextMovie(payload.now));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        // Keep the representative program item when local data is unavailable.
      }
    };

    void loadNextMovie();
    return () => controller.abort();
  }, [boardId]);

  return movie;
};
