import { useEffect, useState } from "react";
import type { FilmProgramMovie } from "@/components/filmClubProgramData";
import { withBasePath } from "@/lib/basePath";
import styles from "@/styles/filmClubProgram.module.css";

interface NextFilmTvProps {
  movie: Pick<FilmProgramMovie, "id" | "title" | "coverImage"> & {
    trailerYoutubeId?: string | null;
  };
}

interface TrailerState {
  movieId: number;
  youtubeId: string | null;
}

const getTrailerEmbedUrl = (youtubeId: string): string => {
  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    controls: "0",
    loop: "1",
    playlist: youtubeId,
    playsinline: "1",
    rel: "0",
    disablekb: "1",
    fs: "0",
    iv_load_policy: "3",
    start: "4",
  });

  return `https://www.youtube-nocookie.com/embed/${youtubeId}?${params.toString()}`;
};

export const NextFilmTv = ({ movie }: NextFilmTvProps) => {
  const [trailer, setTrailer] = useState<TrailerState>({
    movieId: movie.id,
    youtubeId: movie.trailerYoutubeId ?? null,
  });

  useEffect(() => {
    const controller = new AbortController();
    setTrailer({
      movieId: movie.id,
      youtubeId: movie.trailerYoutubeId ?? null,
    });

    if (movie.trailerYoutubeId) {
      return () => controller.abort();
    }

    const loadTrailer = async () => {
      try {
        const params = new URLSearchParams({ movieId: String(movie.id) });
        const response = await fetch(
          withBasePath(`/api/tmdb/trailer?${params.toString()}`),
          { signal: controller.signal },
        );
        if (!response.ok) {
          return;
        }

        const payload: unknown = await response.json();
        if (!payload || typeof payload !== "object") {
          return;
        }

        const youtubeId = (payload as { youtubeId?: unknown }).youtubeId;
        if (typeof youtubeId === "string" || youtubeId === null) {
          setTrailer({ movieId: movie.id, youtubeId });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    };

    void loadTrailer();
    return () => controller.abort();
  }, [movie.id, movie.trailerYoutubeId]);

  const youtubeId =
    trailer.movieId === movie.id
      ? trailer.youtubeId
      : (movie.trailerYoutubeId ?? null);

  return (
    <div className={styles.nextTv} aria-label={`Trailer for ${movie.title}`}>
      <div className={styles.nextTvScreen}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={styles.nextTvPoster}
          src={withBasePath(movie.coverImage)}
          alt=""
          draggable={false}
        />
        {youtubeId ? (
          <iframe
            className={styles.nextTvVideo}
            src={getTrailerEmbedUrl(youtubeId)}
            title={`Trailer for ${movie.title}`}
            allow="autoplay; encrypted-media; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            tabIndex={-1}
          />
        ) : null}
        <span className={styles.nextTvGlow} aria-hidden="true" />
      </div>
    </div>
  );
};
