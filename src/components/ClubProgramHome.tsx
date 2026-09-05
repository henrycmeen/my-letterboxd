import Head from "next/head";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClosedFilmRound } from "@/components/ClosedFilmRound";
import { FilmVoteWall, type FilmVoteMovie } from "@/components/FilmVoteWall";
import { formatFilmDate } from "@/components/filmClubProgramData";
import { NextFilmTv } from "@/components/NextFilmTv";
import {
  fetchFilmRoundStatus,
  isFilmRoundAbortError,
  type FilmRoundSnapshot,
} from "@/lib/filmRoundClient";
import {
  getActiveVoteBoardId,
  getFilmClubProgramme,
} from "@/lib/filmClubProgramme";
import styles from "@/styles/filmClubProgram.module.css";

type RoundState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "open"; boardId: string }
  | { status: "closed"; boardId: string; snapshot: FilmRoundSnapshot };

const INITIAL_ROUND_STATE: RoundState = { status: "loading" };
const ROUND_POLL_INTERVAL_MS = 15_000;

interface ClubProgramHomeProps {
  clubSlug: string;
}

const getScreeningId = (
  value: string | string[] | undefined,
): string | undefined => {
  const candidate = Array.isArray(value) ? value[0] : value;
  const normalized = candidate?.trim();
  if (!normalized) {
    return undefined;
  }
  return normalized;
};

export const ClubProgramHome = ({ clubSlug }: ClubProgramHomeProps) => {
  const router = useRouter();
  const requestedScreeningId = useMemo(
    () => (router.isReady ? getScreeningId(router.query.screening) : undefined),
    [router.isReady, router.query.screening],
  );
  const programme = getFilmClubProgramme(clubSlug);
  const fallbackBoardId = getActiveVoteBoardId(clubSlug);
  const [roundState, setRoundState] = useState<RoundState>(INITIAL_ROUND_STATE);
  const [leader, setLeader] = useState<FilmVoteMovie | null>(null);
  const roundStateRef = useRef<RoundState>(INITIAL_ROUND_STATE);
  const roundRequestRef = useRef(0);
  const roundAbortRef = useRef<AbortController | null>(null);
  const roundInFlightRef = useRef(false);

  const updateRoundState = useCallback((next: RoundState) => {
    roundStateRef.current = next;
    setRoundState(next);
  }, []);

  const refreshRound = useCallback(
    async ({ force = false, showLoading = false } = {}): Promise<void> => {
      if (roundInFlightRef.current) {
        if (!force) {
          return;
        }
        roundAbortRef.current?.abort();
      }

      roundInFlightRef.current = true;
      const requestId = roundRequestRef.current + 1;
      roundRequestRef.current = requestId;
      const controller = new AbortController();
      roundAbortRef.current = controller;
      if (showLoading) {
        updateRoundState({ status: "loading" });
      }

      try {
        const status = await fetchFilmRoundStatus({
          clubSlug,
          screeningId: requestedScreeningId,
          signal: controller.signal,
        });
        if (
          controller.signal.aborted ||
          requestId !== roundRequestRef.current
        ) {
          return;
        }
        if (status.status === "closed") {
          updateRoundState({
            status: "closed",
            boardId: status.boardId,
            snapshot: status.snapshot,
          });
        } else {
          updateRoundState({ status: "open", boardId: status.boardId });
        }
      } catch (error) {
        if (
          controller.signal.aborted ||
          requestId !== roundRequestRef.current ||
          isFilmRoundAbortError(error)
        ) {
          return;
        }
        if (showLoading || roundStateRef.current.status === "loading") {
          updateRoundState({
            status: "error",
            message:
              "Avstemningen kunne ikke hentes. Prøv igjen når forbindelsen er tilbake.",
          });
        }
      } finally {
        if (roundAbortRef.current === controller) {
          roundAbortRef.current = null;
          roundInFlightRef.current = false;
        }
      }
    },
    [clubSlug, requestedScreeningId, updateRoundState],
  );

  useEffect(() => {
    roundAbortRef.current?.abort();
    roundRequestRef.current += 1;
    roundInFlightRef.current = false;
    updateRoundState({ status: "loading" });

    const refreshWhenVisible = () => {
      if (
        document.visibilityState === "visible" &&
        roundStateRef.current.status !== "closed"
      ) {
        void refreshRound({ force: true });
      }
    };

    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    void refreshRound({ showLoading: true });

    return () => {
      roundAbortRef.current?.abort();
      roundRequestRef.current += 1;
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshRound, updateRoundState]);

  useEffect(() => {
    if (roundState.status !== "open") {
      return;
    }

    const pollTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshRound();
      }
    }, ROUND_POLL_INTERVAL_MS);

    return () => window.clearInterval(pollTimer);
  }, [refreshRound, roundState.status]);

  const handleRoundClosed = useCallback(() => {
    void refreshRound({ force: true, showLoading: true });
  }, [refreshRound]);

  const boardId =
    roundState.status === "open" || roundState.status === "closed"
      ? roundState.boardId
      : fallbackBoardId;

  useEffect(() => {
    setLeader(null);
  }, [boardId]);

  if (roundState.status === "closed") {
    return (
      <ClosedFilmRound
        key={roundState.snapshot.snapshotId}
        snapshot={roundState.snapshot}
      />
    );
  }

  return (
    <>
      <Head>
        <title>Filmklubben</title>
        <meta
          name="description"
          content="Neste film, tidligere visninger og avstemning i Filmklubben."
        />
      </Head>

      <main className={styles.programPage}>
        <section className={styles.nextSection} id="neste">
          <div className={styles.sectionLabel}>
            <span>Neste film</span>
            <span>{formatFilmDate(programme.activeScreening.scheduledAt)}</span>
          </div>

          <div className={styles.nextLayout}>
            <div className={styles.nextCase}>
              <NextFilmTv movie={leader} />
            </div>
          </div>
        </section>

        {roundState.status === "open" ? (
          <FilmVoteWall
            key={boardId}
            boardId={boardId}
            onLeaderChange={setLeader}
            onRoundClosed={handleRoundClosed}
          />
        ) : roundState.status === "loading" ? (
          <section
            className={styles.voteWallSection}
            aria-busy="true"
            aria-live="polite"
          >
            <p>Henter avstemningen…</p>
          </section>
        ) : (
          <section className={styles.voteWallSection} aria-live="polite">
            <p role="status">{roundState.message}</p>
            <button
              type="button"
              onClick={() =>
                void refreshRound({ force: true, showLoading: true })
              }
            >
              Prøv igjen
            </button>
          </section>
        )}
      </main>
    </>
  );
};
