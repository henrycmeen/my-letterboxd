import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import filmVoteCatalogue from "@/data/filmVoteCatalogue.json";
import { withBasePath } from "@/lib/basePath";
import {
  areVoteSnapshotsEqual,
  getFlipMotion,
  parseFilmVoteSnapshot,
  shouldApplyVoteSnapshot,
  type FilmVoteClientSnapshot,
  type SlotPosition,
} from "@/lib/filmVoteClient";
import styles from "@/styles/filmClubProgram.module.css";

const FILM_BY_ID = new Map(filmVoteCatalogue.map((film) => [film.id, film]));
const FILM_ID_SET = new Set(filmVoteCatalogue.map((film) => film.id));

export type FilmVoteMovie = (typeof filmVoteCatalogue)[number];
export const INITIAL_VOTE_LEADER = filmVoteCatalogue[0]!;

interface FilmVoteWallProps {
  boardId: string;
  onLeaderChange?: (film: FilmVoteMovie) => void;
}

const createInitialSnapshot = (boardId: string): FilmVoteClientSnapshot => ({
  boardId,
  ranking: filmVoteCatalogue.map((film) => ({ filmId: film.id, votes: 0 })),
  revision: 0,
  votedFilmIds: [],
});

export const FilmVoteWall = ({
  boardId,
  onLeaderChange,
}: FilmVoteWallProps) => {
  const [snapshot, setSnapshot] = useState<FilmVoteClientSnapshot>(() =>
    createInitialSnapshot(boardId),
  );
  const snapshotRef = useRef(snapshot);
  const itemNodes = useRef(new Map<number, HTMLLIElement>());
  const previousSlots = useRef(new Map<number, SlotPosition>());
  const previousRanks = useRef(new Map<number, number>());
  const runningAnimations = useRef(new Map<number, Animation>());
  const pendingFilmIds = useRef(new Set<number>());

  const rankedFilms = useMemo(
    () =>
      snapshot.ranking.flatMap((count) => {
        const film = FILM_BY_ID.get(count.filmId);
        return film ? [{ count, film }] : [];
      }),
    [snapshot.ranking],
  );
  const votedFilmIds = useMemo(
    () => new Set(snapshot.votedFilmIds),
    [snapshot.votedFilmIds],
  );

  const captureCurrentLayout = useCallback(() => {
    previousSlots.current = new Map(
      Array.from(itemNodes.current, ([filmId, node]) => {
        const rect = node.getBoundingClientRect();
        return [filmId, { left: rect.left, top: rect.top }];
      }),
    );
    previousRanks.current = new Map(
      snapshotRef.current.ranking.map(({ filmId }, rank) => [filmId, rank]),
    );
  }, []);

  const applySnapshot = useCallback(
    (candidate: FilmVoteClientSnapshot) => {
      if (
        !shouldApplyVoteSnapshot(
          snapshotRef.current.revision,
          candidate.revision,
        )
      ) {
        return;
      }

      if (areVoteSnapshotsEqual(snapshotRef.current, candidate)) {
        return;
      }

      captureCurrentLayout();
      snapshotRef.current = candidate;
      setSnapshot(candidate);
    },
    [captureCurrentLayout],
  );

  const loadSnapshot = useCallback(
    async (filmId?: number): Promise<void> => {
      const query = new URLSearchParams({ boardId });
      const response = await fetch(
        withBasePath(`/api/club/votes?${query.toString()}`),
        filmId === undefined
          ? { cache: "no-store" }
          : {
              body: JSON.stringify({ filmId }),
              cache: "no-store",
              headers: { "Content-Type": "application/json" },
              method: "POST",
            },
      );
      if (!response.ok) {
        return;
      }

      const parsed = parseFilmVoteSnapshot(
        await response.json(),
        boardId,
        FILM_ID_SET,
      );
      if (parsed) {
        applySnapshot(parsed);
      }
    },
    [applySnapshot, boardId],
  );

  useEffect(() => {
    const initialSnapshot = createInitialSnapshot(boardId);
    snapshotRef.current = initialSnapshot;
    setSnapshot(initialSnapshot);
    let isCancelled = false;
    let pollTimer: number | undefined;

    const poll = async () => {
      try {
        await loadSnapshot();
      } catch {
        // Keep the wall usable with its last confirmed ordering.
      }

      if (!isCancelled) {
        pollTimer = window.setTimeout(() => void poll(), 5_000);
      }
    };

    void poll();
    return () => {
      isCancelled = true;
      if (pollTimer !== undefined) {
        window.clearTimeout(pollTimer);
      }
    };
  }, [boardId, loadSnapshot]);

  useEffect(() => {
    const leader = rankedFilms[0]?.film;
    if (leader) {
      onLeaderChange?.(leader);
    }
  }, [onLeaderChange, rankedFilms]);

  useLayoutEffect(() => {
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const currentRanks = new Map(
      snapshot.ranking.map(({ filmId }, rank) => [filmId, rank]),
    );

    for (const [filmId, node] of itemNodes.current) {
      runningAnimations.current.get(filmId)?.cancel();
      runningAnimations.current.delete(filmId);
      delete node.dataset.moving;
      const previous = previousSlots.current.get(filmId);
      if (!previous || prefersReducedMotion) {
        continue;
      }

      const rect = node.getBoundingClientRect();
      const rankDelta =
        (previousRanks.current.get(filmId) ?? 0) -
        (currentRanks.get(filmId) ?? 0);
      const motion = getFlipMotion(
        previous,
        { left: rect.left, top: rect.top },
        rankDelta,
      );
      if (!motion) {
        continue;
      }

      node.dataset.moving = "true";
      const overshootX = motion.from.x * -0.025;
      const overshootY = motion.from.y * -0.025;
      const animation = node.animate(
        [
          {
            offset: 0,
            transform: `translate3d(${motion.from.x}px, ${motion.from.y}px, 0) scale(0.985)`,
          },
          {
            offset: 0.78,
            transform: `translate3d(${overshootX}px, ${overshootY}px, 0) scale(1.012)`,
          },
          { offset: 1, transform: "translate3d(0, 0, 0) scale(1)" },
        ],
        {
          delay: motion.delayMs,
          duration: motion.durationMs,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        },
      );
      runningAnimations.current.set(filmId, animation);
      animation.addEventListener(
        "finish",
        () => {
          delete node.dataset.moving;
          runningAnimations.current.delete(filmId);
        },
        { once: true },
      );
    }

    previousSlots.current.clear();
    previousRanks.current.clear();
  }, [snapshot.ranking]);

  const voteForFilm = async (filmId: number) => {
    if (votedFilmIds.has(filmId) || pendingFilmIds.current.has(filmId)) {
      return;
    }

    pendingFilmIds.current.add(filmId);
    try {
      await loadSnapshot(filmId);
    } catch {
      // A failed vote leaves the current shared ordering untouched.
    } finally {
      pendingFilmIds.current.delete(filmId);
    }
  };

  return (
    <section className={styles.voteWallSection} id="stem">
      <ol className={styles.voteGrid} aria-label="Filmer du kan stemme på">
        {rankedFilms.map(({ count, film }, index) => {
          const hasVoted = votedFilmIds.has(film.id);
          const isLeader = index === 0;
          const rank = index + 1;

          return (
            <li
              key={film.id}
              ref={(node) => {
                if (node) {
                  itemNodes.current.set(film.id, node);
                } else {
                  itemNodes.current.delete(film.id);
                }
              }}
            >
              <button
                className={styles.voteFilm}
                type="button"
                aria-label={`Stem på ${film.title}. Plass ${rank}, ${count.votes} stemmer.`}
                aria-pressed={hasVoted}
                data-leader={isLeader}
                onClick={() => void voteForFilm(film.id)}
              >
                <span className={styles.voteCaseInterior} aria-hidden="true">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className={styles.voteCaseShell}
                    src={withBasePath(
                      "/VHS/program/case-underlay-trimmed.avif",
                    )}
                    alt=""
                    draggable={false}
                  />
                  {!isLeader ? (
                    <span className={styles.voteCassetteTray}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        className={styles.voteCassette}
                        src={withBasePath("/VHS/program/cassette-trimmed.avif")}
                        alt=""
                        draggable={false}
                      />
                    </span>
                  ) : null}
                </span>
                <span className={styles.voteCaseCover} aria-hidden="true">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={withBasePath(film.coverImage)}
                    alt=""
                    draggable={false}
                    loading={index < 30 ? "eager" : "lazy"}
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
