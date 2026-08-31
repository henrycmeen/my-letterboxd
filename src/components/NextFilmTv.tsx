import { useCallback, useEffect, useRef, useState } from "react";
import type { FilmProgramMovie } from "@/components/filmClubProgramData";
import { withBasePath } from "@/lib/basePath";
import {
  buildYoutubeTrailerEmbedUrl,
  getYoutubePlaybackProgress,
  isYoutubeEndedMessage,
  isYoutubePausedMessage,
  isYoutubePlayingMessage,
  shouldRestartYoutubeTrailer,
} from "@/lib/youtubeEmbed";
import {
  advanceTvPhase,
  buildTvPlayerKey,
  getTvRevealDelay,
  TV_TRANSITION_TIMING,
  type TvPhase,
} from "@/lib/tvTransition";
import styles from "@/styles/filmClubProgram.module.css";

type NextFilmMovie = Pick<FilmProgramMovie, "id" | "title" | "coverImage"> & {
  trailerYoutubeId?: string | null;
};

interface NextFilmTvProps {
  movie: NextFilmMovie | null;
}

interface ReadyNextFilmTvProps {
  movie: NextFilmMovie;
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

const TvStaticNoise = () => (
  <span className={styles.nextTvStatic} aria-hidden="true">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img
      className={styles.nextTvStaticGrain}
      src={withBasePath("/VHS/program/analog-no-signal-frame.avif")}
      alt=""
      draggable={false}
    />
    <span className={styles.nextTvSyncTear} />
  </span>
);

const EmptyNextFilmTv = () => {
  const [isTuning, setIsTuning] = useState(true);

  useEffect(() => {
    const revealDelay = getTvRevealDelay(null, "emptyReady");
    if (revealDelay === null) {
      return;
    }

    const revealTimer = window.setTimeout(() => setIsTuning(false), revealDelay);
    return () => window.clearTimeout(revealTimer);
  }, []);

  return (
    <div
      className={styles.nextTv}
      aria-busy={isTuning || undefined}
      aria-label={
        isTuning
          ? "Henter filmen som leder avstemningen"
          : "Ingen film leder avstemningen ennå"
      }
    >
      <div className={styles.nextTvScreen}>
        {isTuning ? <TvStaticNoise /> : null}
        <span className={styles.nextTvShield} aria-hidden="true" />
        <span className={styles.nextTvGlow} aria-hidden="true" />
      </div>
    </div>
  );
};

const ReadyNextFilmTv = ({ movie }: ReadyNextFilmTvProps) => {
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
  const [phase, setPhase] = useState<TvPhase>("tuning");
  const [playerGeneration, setPlayerGeneration] = useState(0);
  const [usePosterFallback, setUsePosterFallback] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const blockedTrailerTimer = useRef<number | null>(null);
  const phaseRef = useRef<TvPhase>("tuning");
  const revealTimer = useRef<number | null>(null);
  const phaseTimer = useRef<number | null>(null);
  const previousMovieId = useRef(movie.id);
  const restartPending = useRef(false);

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

  useEffect(() => {
    restartPending.current = false;
  }, [youtubeId]);

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
        phaseTimer.current = null;
      }
      if (blockedTrailerTimer.current !== null) {
        window.clearTimeout(blockedTrailerTimer.current);
        blockedTrailerTimer.current = null;
      }

      setUsePosterFallback(false);
      setTvPhase(advanceTvPhase(phaseRef.current, "movieChanged"));
      phaseTimer.current = window.setTimeout(() => {
        setDisplayed(pendingDisplay.current);
        setPlayerGeneration((generation) => generation + 1);
        setTvPhase(advanceTvPhase(phaseRef.current, "powerOffFinished"));
        phaseTimer.current = null;
      }, TV_TRANSITION_TIMING.powerOffMs);
      return;
    }

    if (displayed.movieId === movie.id && displayed.youtubeId !== youtubeId) {
      if (revealTimer.current !== null) {
        window.clearTimeout(revealTimer.current);
        revealTimer.current = null;
      }
      if (phaseTimer.current !== null) {
        window.clearTimeout(phaseTimer.current);
        phaseTimer.current = null;
      }
      if (blockedTrailerTimer.current !== null) {
        window.clearTimeout(blockedTrailerTimer.current);
        blockedTrailerTimer.current = null;
      }
      setUsePosterFallback(false);
      setDisplayed(pendingDisplay.current);
      setPlayerGeneration((generation) => generation + 1);
      setTvPhase("tuning");
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
      if (blockedTrailerTimer.current !== null) {
        window.clearTimeout(blockedTrailerTimer.current);
      }
    };
  }, []);

  const revealPicture = useCallback(
    (delay: number) => {
      if (phaseRef.current !== "tuning") {
        return;
      }

      if (revealTimer.current !== null) {
        return;
      }

      revealTimer.current = window.setTimeout(() => {
        revealTimer.current = null;
        if (phaseRef.current !== "tuning") {
          return;
        }

        setTvPhase(advanceTvPhase(phaseRef.current, "signalReady"));

        phaseTimer.current = window.setTimeout(() => {
          setTvPhase(advanceTvPhase(phaseRef.current, "powerOnFinished"));
          phaseTimer.current = null;
        }, TV_TRANSITION_TIMING.powerOnMs);
      }, delay);
    },
    [setTvPhase],
  );

  const revealPosterFallback = useCallback(() => {
    setUsePosterFallback(true);
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func: "pauseVideo", args: [] }),
      "https://www.youtube-nocookie.com",
    );
    revealPicture(TV_TRANSITION_TIMING.posterSignalHoldMs);
  }, [revealPicture]);

  useEffect(() => {
    if (phase === "tuning" && !displayed.youtubeId) {
      const delay = getTvRevealDelay(displayed.youtubeId, "posterReady");
      if (delay !== null) {
        revealPicture(delay);
      }
    }
  }, [displayed.youtubeId, phase, revealPicture]);

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

    // Keep the no-signal layer visible until YouTube confirms playback.
    // Safari can reject autoplay even for muted embeds. In that case the
    // poster replaces the iframe before the signal layer is removed.
  }, [displayed.youtubeId]);

  useEffect(() => {
    if (phase !== "tuning" || !displayed.youtubeId || usePosterFallback) {
      return;
    }

    blockedTrailerTimer.current = window.setTimeout(() => {
      blockedTrailerTimer.current = null;
      revealPosterFallback();
    }, TV_TRANSITION_TIMING.blockedTrailerFallbackMs);

    return () => {
      if (blockedTrailerTimer.current !== null) {
        window.clearTimeout(blockedTrailerTimer.current);
        blockedTrailerTimer.current = null;
      }
    };
  }, [displayed.youtubeId, phase, revealPosterFallback, usePosterFallback]);

  useEffect(() => {
    const restartTrailer = () => {
      if (restartPending.current) {
        return;
      }

      restartPending.current = true;
      const playerWindow = iframeRef.current?.contentWindow;
      playerWindow?.postMessage(
        JSON.stringify({ event: "command", func: "seekTo", args: [0, true] }),
        "https://www.youtube-nocookie.com",
      );
      playerWindow?.postMessage(
        JSON.stringify({ event: "command", func: "playVideo", args: [] }),
        "https://www.youtube-nocookie.com",
      );
    };

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
        if (blockedTrailerTimer.current !== null) {
          window.clearTimeout(blockedTrailerTimer.current);
          blockedTrailerTimer.current = null;
        }
        if (!usePosterFallback) {
          const delay = getTvRevealDelay(displayed.youtubeId, "youtubePlaying");
          if (delay !== null) {
            revealPicture(delay);
          }
        }
      }

      if (
        isYoutubePausedMessage(payload) &&
        phaseRef.current !== "poweringOff" &&
        !usePosterFallback
      ) {
        if (blockedTrailerTimer.current !== null) {
          window.clearTimeout(blockedTrailerTimer.current);
          blockedTrailerTimer.current = null;
        }
        if (
          phaseRef.current === "tuning" &&
          revealTimer.current !== null
        ) {
          window.clearTimeout(revealTimer.current);
          revealTimer.current = null;
        }
        revealPosterFallback();
      }

      const progress = getYoutubePlaybackProgress(payload);
      if (progress && progress.currentTime < progress.duration * 0.1) {
        restartPending.current = false;
      }

      if (
        shouldRestartYoutubeTrailer(payload) ||
        isYoutubeEndedMessage(payload)
      ) {
        restartTrailer();
      }
    };

    window.addEventListener("message", handleYoutubeMessage);
    return () => window.removeEventListener("message", handleYoutubeMessage);
  }, [
    displayed.youtubeId,
    revealPicture,
    revealPosterFallback,
    usePosterFallback,
  ]);

  const pictureClassName = `${styles.nextTvPicture} ${
    phase === "poweringOff"
      ? styles.nextTvPicturePoweringOff
      : phase === "poweringOn"
        ? styles.nextTvPicturePoweringOn
        : phase === "playing"
          ? styles.nextTvPicturePlaying
          : styles.nextTvPictureTuning
  }`;

  return (
    <div className={styles.nextTv} aria-label={`Trailer for ${movie.title}`}>
      <div className={styles.nextTvScreen}>
        <div className={pictureClassName}>
          {displayed.youtubeId ? (
            <iframe
              key={buildTvPlayerKey(displayed.youtubeId, playerGeneration)}
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
          ) : null}
          {!displayed.youtubeId || usePosterFallback ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={styles.nextTvPoster}
              src={withBasePath(displayed.coverImage)}
              alt=""
              draggable={false}
            />
          ) : null}
        </div>
        {phase === "tuning" ? <TvStaticNoise /> : null}
        {phase === "poweringOn" ? (
          <>
            <span className={styles.nextTvSignalLock} aria-hidden="true" />
            <span className={styles.nextTvPowerOnFlash} aria-hidden="true" />
          </>
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

export const NextFilmTv = ({ movie }: NextFilmTvProps) => {
  if (movie) {
    return <ReadyNextFilmTv movie={movie} />;
  }

  return <EmptyNextFilmTv />;
};
