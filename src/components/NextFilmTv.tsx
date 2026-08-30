import { useCallback, useEffect, useRef, useState } from "react";
import type { FilmProgramMovie } from "@/components/filmClubProgramData";
import { withBasePath } from "@/lib/basePath";
import {
  buildYoutubeTrailerEmbedUrl,
  isYoutubePlayingMessage,
} from "@/lib/youtubeEmbed";
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

interface DisplayedTrailer {
  coverImage: string;
  movieId: number;
  title: string;
  youtubeId: string | null;
}

type TvPhase = "waiting" | "poweringOff" | "poweringOn" | "playing";

export const NextFilmTv = ({ movie }: NextFilmTvProps) => {
  const [trailer, setTrailer] = useState<TrailerState>({
    movieId: movie.id,
    youtubeId: movie.trailerYoutubeId ?? null,
  });
  const [displayed, setDisplayed] = useState<DisplayedTrailer>({
    coverImage: movie.coverImage,
    movieId: movie.id,
    title: movie.title,
    youtubeId: movie.trailerYoutubeId ?? null,
  });
  const [phase, setPhase] = useState<TvPhase>("waiting");
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const phaseRef = useRef<TvPhase>("waiting");
  const revealTimer = useRef<number | null>(null);
  const phaseTimer = useRef<number | null>(null);
  const previousMovieId = useRef(movie.id);

  const setTvPhase = useCallback((nextPhase: TvPhase) => {
    phaseRef.current = nextPhase;
    setPhase(nextPhase);
  }, []);

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

  const pendingDisplay = useRef<DisplayedTrailer>({
    coverImage: movie.coverImage,
    movieId: movie.id,
    title: movie.title,
    youtubeId,
  });
  pendingDisplay.current = {
    coverImage: movie.coverImage,
    movieId: movie.id,
    title: movie.title,
    youtubeId,
  };

  useEffect(() => {
    if (previousMovieId.current !== movie.id) {
      previousMovieId.current = movie.id;

      if (revealTimer.current !== null) {
        window.clearTimeout(revealTimer.current);
        revealTimer.current = null;
      }
      if (phaseTimer.current !== null) {
        window.clearTimeout(phaseTimer.current);
      }

      setTvPhase("poweringOff");
      phaseTimer.current = window.setTimeout(() => {
        setDisplayed(pendingDisplay.current);
        setTvPhase("waiting");
        phaseTimer.current = null;
      }, 640);
      return;
    }

    if (displayed.movieId === movie.id && displayed.youtubeId !== youtubeId) {
      setDisplayed(pendingDisplay.current);
      setTvPhase("waiting");
    }
  }, [displayed.movieId, displayed.youtubeId, movie.id, setTvPhase, youtubeId]);

  useEffect(() => {
    return () => {
      if (revealTimer.current !== null) {
        window.clearTimeout(revealTimer.current);
      }
      if (phaseTimer.current !== null) {
        window.clearTimeout(phaseTimer.current);
      }
    };
  }, []);

  const revealPlayingTrailer = useCallback(
    (delay: number) => {
      if (!displayed.youtubeId) {
        return;
      }

      if (revealTimer.current !== null) {
        window.clearTimeout(revealTimer.current);
      }

      revealTimer.current = window.setTimeout(() => {
        if (phaseRef.current !== "waiting") {
          return;
        }

        setTvPhase("poweringOn");
        revealTimer.current = null;

        phaseTimer.current = window.setTimeout(() => {
          setTvPhase("playing");
          phaseTimer.current = null;
        }, 920);
      }, delay);
    },
    [displayed.youtubeId, setTvPhase],
  );

  const prepareTrailerPlayback = useCallback(() => {
    if (!displayed.youtubeId) {
      return;
    }

    const playerWindow = iframeRef.current?.contentWindow;
    if (playerWindow) {
      playerWindow.postMessage(
        JSON.stringify({
          channel: "filmklubb-tv",
          event: "listening",
          id: "filmklubb-tv",
        }),
        "https://www.youtube-nocookie.com",
      );
      playerWindow.postMessage(
        JSON.stringify({ event: "command", func: "playVideo", args: [] }),
        "https://www.youtube-nocookie.com",
      );
    }

    // A bounded fallback still powers the TV on if a browser suppresses
    // YouTube's playback-state message.
    revealPlayingTrailer(11_000);
  }, [displayed.youtubeId, revealPlayingTrailer]);

  useEffect(() => {
    const handleYoutubeMessage = (event: MessageEvent<unknown>) => {
      if (
        event.origin !== "https://www.youtube-nocookie.com" ||
        event.source !== iframeRef.current?.contentWindow
      ) {
        return;
      }

      let payload = event.data;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload) as unknown;
        } catch {
          return;
        }
      }

      if (isYoutubePlayingMessage(payload)) {
        revealPlayingTrailer(6_000);
      }
    };

    window.addEventListener("message", handleYoutubeMessage);
    return () => window.removeEventListener("message", handleYoutubeMessage);
  }, [revealPlayingTrailer]);

  const pictureClassName = `${styles.nextTvPicture} ${
    phase === "poweringOff"
      ? styles.nextTvPicturePoweringOff
      : phase === "poweringOn"
        ? styles.nextTvPicturePoweringOn
        : phase === "playing"
          ? styles.nextTvPicturePlaying
          : styles.nextTvPictureWaiting
  }`;

  return (
    <div className={styles.nextTv} aria-label={`Trailer for ${movie.title}`}>
      <div className={styles.nextTvScreen}>
        <div className={pictureClassName}>
          {!displayed.youtubeId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={styles.nextTvPoster}
              src={withBasePath(displayed.coverImage)}
              alt=""
              draggable={false}
            />
          ) : (
            <iframe
              key={displayed.youtubeId}
              ref={iframeRef}
              className={styles.nextTvVideo}
              src={buildYoutubeTrailerEmbedUrl(displayed.youtubeId)}
              title={`Trailer for ${displayed.title}`}
              allow="autoplay; encrypted-media"
              referrerPolicy="strict-origin-when-cross-origin"
              loading="eager"
              tabIndex={-1}
              onLoad={prepareTrailerPlayback}
            />
          )}
        </div>
        {phase === "poweringOn" ? (
          <span className={styles.nextTvPowerOnFlash} aria-hidden="true" />
        ) : null}
        {phase === "poweringOff" ? (
          <span className={styles.nextTvPowerOffFlash} aria-hidden="true" />
        ) : null}
        <span className={styles.nextTvShield} aria-hidden="true" />
        <span className={styles.nextTvGlow} aria-hidden="true" />
      </div>
    </div>
  );
};
