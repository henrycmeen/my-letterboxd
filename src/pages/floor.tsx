import { type NextPage } from 'next';
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

interface ClubMovie {
  id: number;
  title: string;
  coverImage: string;
}

interface CoversResponse {
  movies: ClubMovie[];
}

interface SearchMovie {
  id: number;
  title: string;
  year: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
}

interface SearchResponse {
  results: SearchMovie[];
}

interface FloorBoardMovie {
  id: number;
  title: string;
  coverImage: string;
  x: number;
  y: number;
  rotation: number;
  z: number;
  rank: number;
  score?: number;
}

interface FloorBoardResponse {
  boardId: string;
  version: number;
  updatedAt: string;
  leaderMovieId: number | null;
  movies: FloorBoardMovie[];
}

interface FloorMovie extends ClubMovie {
  x: number;
  y: number;
  rotation: number;
  z: number;
  rank: number;
  score: number;
}

interface DragState {
  id: number;
  offsetX: number;
  offsetY: number;
}

interface PendingSearch {
  query: string;
  results: SearchMovie[];
  selectedIndex: number;
  loading: boolean;
}

type SearchPreviewTier = 'low' | 'medium' | 'high';

interface AddAnimationState {
  movie: ClubMovie;
  coverImage: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  toRotation: number;
  stage: 'insert' | 'fly';
}

interface DeleteAnimationState {
  id: number;
  title: string;
  coverImage: string;
  x: number;
  y: number;
  rotation: number;
  z: number;
  splitDirection: 1 | -1;
  stage: 'cut' | 'hold' | 'drop';
}

const CARD_WIDTH = 260;
const CARD_HEIGHT = 390;
const WAITING_SLOT_IMAGE = '/VHS/templates/waiting-cover-vhs-black.webp';
const SEARCH_DEBOUNCE_MS = 90;
const COVER_TEMPLATE_ID = 'black-case-front-v1';
const COVER_RENDER_REVISION = 'r11';
const FLOOR_BOARD_ID = 'default';
const CARD_ROTATION_MIN = -9;
const CARD_ROTATION_MAX = 9;
const OPEN_EFFECT_ENABLED = ['1', 'true', 'yes', 'on'].includes(
  (process.env.NEXT_PUBLIC_VHS_OPEN_EFFECT ?? '').trim().toLowerCase()
);
const BOARD_SYNC_DEBOUNCE_MS = 240;
const STARTER_MOVIE_LIMIT = 7;
const SEARCH_RESULT_LIMIT = 8;
const SEARCH_PREVIEW_STEPS: Array<{
  tier: SearchPreviewTier;
  size: number;
  quality: number;
}> = [
  { tier: 'low', size: 520, quality: 42 },
  { tier: 'high', size: 1100, quality: 76 },
];
const ADD_SLOT_HIDDEN_OFFSET = Math.round(CARD_HEIGHT * 0.72);
const ADD_SLOT_HOVER_OFFSET = Math.round(CARD_HEIGHT * 0.4);
const REMOTE_CONTROL_IMAGE = '/VHS/ui/remote-control.webp';
const REMOTE_CONTROL_WIDTH = Math.round(CARD_WIDTH * 0.5);
const REMOTE_CONTROL_HEIGHT = Math.round((443 / 181) * REMOTE_CONTROL_WIDTH);
const REMOTE_VISIBLE_DEFAULT = 78;
const REMOTE_VISIBLE_PEEK = 140;
const REMOTE_SLOT_GAP = 14;
const DELETE_ZONE_HEIGHT = Math.round(CARD_HEIGHT * 0.24);
const DELETE_HOLD_MS = 950;
const DELETE_CUT_MS = 220;
const DELETE_POST_CUT_HOLD_MS = 260;
const DELETE_DROP_MS = 920;
const DELETE_SPLIT_LEFT_PCT = 49;
const DELETE_SPLIT_RIGHT_PCT = 53;
const DELETE_SPLIT_LINE_TOP_PCT = (DELETE_SPLIT_LEFT_PCT + DELETE_SPLIT_RIGHT_PCT) / 2;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const clampCardRotation = (rotation: number): number =>
  clamp(rotation, CARD_ROTATION_MIN, CARD_ROTATION_MAX);

const getRandomCardRotation = (): number =>
  CARD_ROTATION_MIN + Math.random() * (CARD_ROTATION_MAX - CARD_ROTATION_MIN);

const getTopScorePercent = (topY: number, boardHeight: number): number => {
  const maxTop = Math.max(1, boardHeight - CARD_HEIGHT);
  const normalizedTop = clamp(topY, 0, maxTop);
  const score = (1 - normalizedTop / maxTop) * 100;
  return Math.round(score * 10) / 10;
};

const randomFromSeed = (seed: number): number => {
  const raw = Math.sin(seed * 999.91) * 10000;
  return raw - Math.floor(raw);
};

const getSearchPreviewStep = (tier: SearchPreviewTier) =>
  SEARCH_PREVIEW_STEPS.find((step) => step.tier === tier) ??
  SEARCH_PREVIEW_STEPS[0]!;

const getSearchPreviewTierIndex = (tier?: SearchPreviewTier): number =>
  tier ? SEARCH_PREVIEW_STEPS.findIndex((step) => step.tier === tier) : -1;

const isWaitingSlotCover = (coverImage: string): boolean =>
  coverImage.includes('waiting-cover-vhs-black.webp') ||
  coverImage.includes('waiting-cover-vhs.webp') ||
  coverImage.includes('waiting-cover-white.svg') ||
  coverImage.includes('front-placeholder-cover') ||
  coverImage.includes('front-side-cover-flat.webp');

const shouldHydrateBoardCover = (coverImage: string): boolean =>
  isWaitingSlotCover(coverImage) ||
  coverImage.startsWith('http://') ||
  coverImage.startsWith('https://') ||
  (coverImage.includes('/VHS/generated/') &&
    (!coverImage.includes(`-${COVER_TEMPLATE_ID}-`) ||
      !coverImage.includes(`-${COVER_RENDER_REVISION}-`)));

const normalizeCoverImage = (coverImage: string): string =>
  shouldHydrateBoardCover(coverImage) ? WAITING_SLOT_IMAGE : coverImage;

const isCoversResponse = (value: unknown): value is CoversResponse => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as { movies?: unknown };
  if (!Array.isArray(payload.movies)) {
    return false;
  }

  return payload.movies.every((movie) => {
    if (!movie || typeof movie !== 'object') {
      return false;
    }

    const entry = movie as { id?: unknown; title?: unknown; coverImage?: unknown };
    return (
      typeof entry.id === 'number' &&
      typeof entry.title === 'string' &&
      typeof entry.coverImage === 'string'
    );
  });
};

const isSearchResponse = (value: unknown): value is SearchResponse => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as { results?: unknown };
  if (!Array.isArray(payload.results)) {
    return false;
  }

  return payload.results.every((movie) => {
    if (!movie || typeof movie !== 'object') {
      return false;
    }

    const entry = movie as {
      id?: unknown;
      title?: unknown;
      year?: unknown;
      posterUrl?: unknown;
      backdropUrl?: unknown;
    };

    const yearValid =
      typeof entry.year === 'number' || entry.year === null || entry.year === undefined;
    const posterValid =
      typeof entry.posterUrl === 'string' || entry.posterUrl === null || entry.posterUrl === undefined;
    const backdropValid =
      typeof entry.backdropUrl === 'string' ||
      entry.backdropUrl === null ||
      entry.backdropUrl === undefined;

    return (
      typeof entry.id === 'number' &&
      typeof entry.title === 'string' &&
      yearValid &&
      posterValid &&
      backdropValid
    );
  });
};

const isFloorBoardResponse = (value: unknown): value is FloorBoardResponse => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as { movies?: unknown };
  if (!Array.isArray(payload.movies)) {
    return false;
  }

  return payload.movies.every((movie) => {
    if (!movie || typeof movie !== 'object') {
      return false;
    }

    const entry = movie as Partial<FloorBoardMovie>;
    return (
      typeof entry.id === 'number' &&
      typeof entry.title === 'string' &&
      typeof entry.coverImage === 'string' &&
      typeof entry.x === 'number' &&
      typeof entry.y === 'number' &&
      typeof entry.rotation === 'number'
    );
  });
};

const CURATED_TITLES_QUERY = [
  'Blade Runner::1982',
  'The Lord of the Rings: The Fellowship of the Ring::2001',
  '2001: A Space Odyssey::1968',
  'Star Wars::1977',
  'Indiana Jones and the Temple of Doom::1984',
  'Spider-Man::2002',
  'Back to the Future::1985',
].join('|');

const recalculateHierarchy = (
  items: FloorMovie[],
  boardHeight = 760
): FloorMovie[] => {
  if (items.length === 0) {
    return [];
  }

  const sortedByY = [...items].sort((a, b) => a.y - b.y);
  const rankById = new Map(sortedByY.map((movie, index) => [movie.id, index + 1]));
  const total = sortedByY.length;

  return items.map((movie) => {
    const rank = rankById.get(movie.id) ?? total;

    return {
      ...movie,
      rank,
      z: total - rank + 1,
      score: getTopScorePercent(movie.y, boardHeight),
    };
  });
};

const toBoardMoviesPayload = (movies: FloorMovie[]) =>
  movies.map((movie) => ({
    id: movie.id,
    title: movie.title,
    coverImage: movie.coverImage,
    x: movie.x,
    y: movie.y,
    rotation: clampCardRotation(movie.rotation),
    score: movie.score,
  }));

const FloorPage: NextPage = () => {
  const [sourceMovies, setSourceMovies] = useState<ClubMovie[]>([]);
  const [floorMovies, setFloorMovies] = useState<FloorMovie[]>([]);
  const [isInitialBoardLoaded, setIsInitialBoardLoaded] = useState(false);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [pendingSearch, setPendingSearch] = useState<PendingSearch | null>(null);
  const [addAnimation, setAddAnimation] = useState<AddAnimationState | null>(null);
  const [isAddSlotPeek, setIsAddSlotPeek] = useState(false);
  const [isRemotePeek, setIsRemotePeek] = useState(false);
  const [isAddSlotResetAnimating, setIsAddSlotResetAnimating] = useState(false);
  const [deleteCandidateId, setDeleteCandidateId] = useState<number | null>(null);
  const [deleteArmedId, setDeleteArmedId] = useState<number | null>(null);
  const [deleteAnimation, setDeleteAnimation] = useState<DeleteAnimationState | null>(
    null
  );
  const [previewCoverByMovieId, setPreviewCoverByMovieId] = useState<
    Record<number, string>
  >({});
  const [previewTierByMovieId, setPreviewTierByMovieId] = useState<
    Record<number, SearchPreviewTier>
  >({});
  const [activeSearchCover, setActiveSearchCover] = useState<string | null>(null);

  const floorRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const leaderIdRef = useRef<number | null>(null);
  const animationTimersRef = useRef<number[]>([]);
  const addSlotResetRafRef = useRef<number | null>(null);
  const boardSyncTimerRef = useRef<number | null>(null);
  const lastBoardSignatureRef = useRef<string>('');
  const restoredFromBoardRef = useRef(false);
  const previewCoverByMovieIdRef = useRef<Record<number, string>>({});
  const previewTierByMovieIdRef = useRef<Record<number, SearchPreviewTier>>({});
  const deleteCandidateIdRef = useRef<number | null>(null);
  const deleteArmedIdRef = useRef<number | null>(null);
  const deleteHoldTimerRef = useRef<number | null>(null);
  const deleteHoldMovieIdRef = useRef<number | null>(null);
  const deleteInZoneRef = useRef(false);
  const deleteCutTimerRef = useRef<number | null>(null);
  const deleteDropTimerRef = useRef<number | null>(null);
  const deleteCleanupTimerRef = useRef<number | null>(null);
  const renderedCoverPromiseByMovieIdRef = useRef<
    Record<number, Promise<ClubMovie | null>>
  >({});

  const getFloorBounds = useCallback(() => {
    const rect = floorRef.current?.getBoundingClientRect();

    if (!rect) {
      return {
        left: 0,
        top: 0,
        width: 1200,
        height: 760,
      };
    }

    return rect;
  }, []);

  const getEmptySlotPosition = useCallback(() => {
    const bounds = getFloorBounds();
    return {
      x: clamp(bounds.width - CARD_WIDTH - 28, 0, Math.max(0, bounds.width - CARD_WIDTH)),
      y: clamp(bounds.height - CARD_HEIGHT - 24, 0, Math.max(0, bounds.height - CARD_HEIGHT)),
    };
  }, [getFloorBounds]);

  const addMovieToFloor = useCallback(
    (movie: ClubMovie, x: number, y: number, rotationOverride?: number) => {
      const bounds = getFloorBounds();
      const clampedX = clamp(x, 0, Math.max(0, bounds.width - CARD_WIDTH));
      const clampedY = clamp(y, 0, Math.max(0, bounds.height - CARD_HEIGHT));

      setFloorMovies((previous) => {
        const existing = previous.find((item) => item.id === movie.id);
        const nextRotation = clampCardRotation(
          existing?.rotation ?? rotationOverride ?? getRandomCardRotation()
        );
        const maxZ = previous.reduce((current, item) => Math.max(current, item.z), 1);

        const next = existing
          ? previous.map((item) =>
              item.id === movie.id
                ? {
                    ...item,
                    x: clampedX,
                    y: clampedY,
                    rotation: clampCardRotation(rotationOverride ?? item.rotation),
                    z: maxZ + 1,
                  }
                : item
            )
          : [
              ...previous,
              {
                ...movie,
                x: clampedX,
                y: clampedY,
                rotation: nextRotation,
                z: maxZ + 1,
                rank: previous.length + 1,
                score: 0,
              },
            ];

        return recalculateHierarchy(next, bounds.height);
      });
    },
    [getFloorBounds]
  );

  const layoutMovies = useCallback(
    (movies: ClubMovie[]) => {
      if (movies.length === 0) {
        setFloorMovies([]);
        return;
      }

      const bounds = getFloorBounds();
      const centerX = bounds.width * 0.5;
      const centerY = bounds.height * 0.42;
      const spreadX = Math.min(bounds.width * 0.38, 520);
      const spreadY = Math.min(bounds.height * 0.26, 240);
      const maxIndex = Math.max(1, movies.length - 1);

      const seeded: FloorMovie[] = movies.map((movie, index) => ({
        ...movie,
        x: clamp(
          centerX +
            ((index / maxIndex) * 2 - 1) * spreadX +
            (randomFromSeed(movie.id + 11) - 0.5) * 180 -
            CARD_WIDTH / 2,
          0,
          Math.max(0, bounds.width - CARD_WIDTH)
        ),
        y: clamp(
          centerY +
            Math.abs((index / maxIndex) * 2 - 1) * spreadY * 0.65 +
            (randomFromSeed(movie.id + 29) - 0.5) * 120 -
            CARD_HEIGHT / 2,
          0,
          Math.max(0, bounds.height - CARD_HEIGHT)
        ),
        rotation:
          CARD_ROTATION_MIN +
          randomFromSeed(movie.id + 71) * (CARD_ROTATION_MAX - CARD_ROTATION_MIN),
        z: index + 1,
        rank: index + 1,
        score: 0,
      }));

      setFloorMovies(recalculateHierarchy(seeded, bounds.height));
    },
    [getFloorBounds]
  );

  useEffect(() => {
    let ignore = false;

    const loadMovies = async () => {
      try {
        const boardResponse = await fetch(`/api/club/floor?boardId=${FLOOR_BOARD_ID}`);
        if (boardResponse.ok) {
          const boardRaw: unknown = await boardResponse.json();
          if (isFloorBoardResponse(boardRaw) && boardRaw.movies.length > 0 && !ignore) {
            const bounds = getFloorBounds();
            const restoredMovies = recalculateHierarchy(
              boardRaw.movies.map((movie) => ({
                id: movie.id,
                title: movie.title,
                coverImage: normalizeCoverImage(movie.coverImage),
                x: movie.x,
                y: movie.y,
                rotation: clampCardRotation(movie.rotation),
                z: movie.z ?? 1,
                rank: movie.rank ?? 1,
                score: movie.score ?? getTopScorePercent(movie.y, bounds.height),
              })),
              bounds.height
            );

            restoredFromBoardRef.current = true;
            setFloorMovies(restoredMovies);
            setSourceMovies(
              boardRaw.movies.map((movie) => ({
                id: movie.id,
                title: movie.title,
                coverImage: normalizeCoverImage(movie.coverImage),
              }))
            );

            const placeholderMovieIds = boardRaw.movies
              .filter((movie) => shouldHydrateBoardCover(movie.coverImage))
              .map((movie) => movie.id);

            if (placeholderMovieIds.length > 0) {
              for (const movieId of placeholderMovieIds) {
                void (async () => {
                  try {
                    const params = new URLSearchParams({
                      movieId: String(movieId),
                      limit: '1',
                      renderer: 'sharp',
                      templateId: COVER_TEMPLATE_ID,
                    });
                    const response = await fetch(`/api/vhs/covers?${params.toString()}`);
                    if (!response.ok || ignore) {
                      return;
                    }

                    const payloadRaw: unknown = await response.json();
                    if (!isCoversResponse(payloadRaw) || payloadRaw.movies.length === 0) {
                      return;
                    }

                    const hydratedMovie = payloadRaw.movies[0];
                    if (!hydratedMovie || ignore) {
                      return;
                    }

                    const boundsAfterHydration = getFloorBounds();
                    setFloorMovies((previous) =>
                      recalculateHierarchy(
                        previous.map((movie) =>
                          movie.id === movieId
                            ? {
                                ...movie,
                                title: hydratedMovie.title,
                                coverImage: hydratedMovie.coverImage,
                              }
                            : movie
                        ),
                        boundsAfterHydration.height
                      )
                    );

                    setSourceMovies((previous) =>
                      previous.map((movie) =>
                        movie.id === movieId
                          ? {
                              ...movie,
                              title: hydratedMovie.title,
                              coverImage: hydratedMovie.coverImage,
                            }
                          : movie
                      )
                    );
                  } catch {
                    // Keep placeholder hidden if one hydration call fails.
                  }
                })();
              }
            }

            if (!ignore) {
              setIsInitialBoardLoaded(true);
            }
            return;
          }
        }
      } catch {
        // Fall through to curated covers if board hydration fails.
      }

      try {
        const params = new URLSearchParams({
          limit: String(STARTER_MOVIE_LIMIT),
          renderer: 'sharp',
          templateId: COVER_TEMPLATE_ID,
          titles: CURATED_TITLES_QUERY,
        });

        const response = await fetch(`/api/vhs/covers?${params.toString()}`);
        if (!response.ok) {
          return;
        }

        const payloadRaw: unknown = await response.json();
        if (!isCoversResponse(payloadRaw) || payloadRaw.movies.length === 0) {
          return;
        }

        if (!ignore) {
          setSourceMovies(payloadRaw.movies);
        }
      } catch {
        // Leave board empty when API is unavailable.
      } finally {
        if (!ignore) {
          setIsInitialBoardLoaded(true);
        }
      }
    };

    void loadMovies();

    return () => {
      ignore = true;
    };
  }, [getFloorBounds]);

  useEffect(() => {
    if (restoredFromBoardRef.current) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      layoutMovies(sourceMovies);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [layoutMovies, sourceMovies]);

  useEffect(() => {
    const onResize = () => {
      setFloorMovies((previous) => {
        if (previous.length === 0) {
          return previous;
        }

        const bounds = getFloorBounds();

        return recalculateHierarchy(
          previous.map((movie) => ({
            ...movie,
            x: clamp(movie.x, 0, Math.max(0, bounds.width - CARD_WIDTH)),
            y: clamp(movie.y, 0, Math.max(0, bounds.height - CARD_HEIGHT)),
          })),
          bounds.height
        );
      });
    };

    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, [getFloorBounds]);

  useEffect(() => {
    if (!pendingSearch) {
      setActiveSearchCover(null);
      return;
    }

    const query = pendingSearch.query.trim();
    if (query.length < 2) {
      setPendingSearch((current) =>
        current
          ? {
              ...current,
              loading: false,
              results: [],
              selectedIndex: 0,
            }
          : current
      );
      return;
    }

    const previousSelectedId =
      pendingSearch.results[pendingSearch.selectedIndex]?.id ?? null;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setPendingSearch((current) =>
          current ? { ...current, loading: true } : current
        );

        try {
          const params = new URLSearchParams({
            limit: String(SEARCH_RESULT_LIMIT),
            query,
          });

          const response = await fetch(`/api/tmdb/search?${params.toString()}`);
          if (!response.ok) {
            throw new Error(`Search request failed (${response.status}).`);
          }

          const payloadRaw: unknown = await response.json();
          const results =
            isSearchResponse(payloadRaw) && payloadRaw.results.length > 0
              ? payloadRaw.results
              : [];

          if (!cancelled) {
            setPendingSearch((current) =>
              current
                ? {
                    ...current,
                    loading: false,
                    results,
                    selectedIndex:
                      results.length === 0
                        ? 0
                        : Math.max(
                            0,
                            previousSelectedId
                              ? results.findIndex(
                                  (movie) => movie.id === previousSelectedId
                                )
                              : 0
                          ),
                  }
                : current
            );
          }
        } catch {
          if (!cancelled) {
            setPendingSearch((current) =>
              current
                ? {
                    ...current,
                    loading: false,
                    results: [],
                    selectedIndex: 0,
                  }
                : current
            );
          }
        }
      })();
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pendingSearch?.query]);

  const clearDeleteHoldTimer = useCallback(() => {
    if (deleteHoldTimerRef.current !== null) {
      window.clearTimeout(deleteHoldTimerRef.current);
      deleteHoldTimerRef.current = null;
    }
  }, []);

  const clearDeleteAnimationTimers = useCallback(() => {
    if (deleteCutTimerRef.current !== null) {
      window.clearTimeout(deleteCutTimerRef.current);
      deleteCutTimerRef.current = null;
    }
    if (deleteDropTimerRef.current !== null) {
      window.clearTimeout(deleteDropTimerRef.current);
      deleteDropTimerRef.current = null;
    }
    if (deleteCleanupTimerRef.current !== null) {
      window.clearTimeout(deleteCleanupTimerRef.current);
      deleteCleanupTimerRef.current = null;
    }
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>, id: number) => {
    event.preventDefault();
    setPendingSearch(null);
    clearDeleteHoldTimer();
    deleteInZoneRef.current = false;
    deleteHoldMovieIdRef.current = null;
    setDeleteCandidateId(null);
    setDeleteArmedId(null);

    const bounds = getFloorBounds();
    const selected = floorMovies.find((movie) => movie.id === id);

    if (!selected) {
      return;
    }

    dragRef.current = {
      id,
      offsetX: event.clientX - bounds.left - selected.x,
      offsetY: event.clientY - bounds.top - selected.y,
    };

    setDraggingId(id);
    setFloorMovies((previous) => {
      const maxZ = previous.reduce((current, movie) => Math.max(current, movie.z), 1);

      return previous.map((movie) =>
        movie.id === id
          ? {
              ...movie,
              z: maxZ + 1,
            }
          : movie
      );
    });
  };

  const handleGlobalPointerMove = useCallback(
    (event: PointerEvent) => {
      const drag = dragRef.current;

      if (!drag) {
        return;
      }

      const bounds = getFloorBounds();
      const x = clamp(event.clientX - bounds.left - drag.offsetX, 0, Math.max(0, bounds.width - CARD_WIDTH));
      const y = clamp(event.clientY - bounds.top - drag.offsetY, 0, Math.max(0, bounds.height - CARD_HEIGHT));
      const deleteZoneTop = bounds.height - DELETE_ZONE_HEIGHT;
      const isInDeleteZone = y + CARD_HEIGHT >= deleteZoneTop;
      deleteInZoneRef.current = isInDeleteZone;

      if (isInDeleteZone) {
        if (deleteCandidateIdRef.current !== drag.id) {
          setDeleteCandidateId(drag.id);
        }

        if (
          deleteArmedIdRef.current !== drag.id &&
          deleteHoldMovieIdRef.current !== drag.id
        ) {
          clearDeleteHoldTimer();
          deleteHoldMovieIdRef.current = drag.id;
          deleteHoldTimerRef.current = window.setTimeout(() => {
            const activeDragId = dragRef.current?.id ?? null;
            if (activeDragId === drag.id && deleteInZoneRef.current) {
              setDeleteArmedId(drag.id);
              setDeleteCandidateId(drag.id);
            }
          }, DELETE_HOLD_MS);
        }
      } else {
        if (deleteCandidateIdRef.current === drag.id) {
          setDeleteCandidateId(null);
        }
        if (deleteArmedIdRef.current === drag.id) {
          setDeleteArmedId(null);
        }
        if (deleteHoldMovieIdRef.current === drag.id) {
          clearDeleteHoldTimer();
          deleteHoldMovieIdRef.current = null;
        }
      }

      setFloorMovies((previous) =>
        recalculateHierarchy(
          previous.map((movie) =>
            movie.id === drag.id
              ? {
                  ...movie,
                  x,
                  y,
                }
              : movie
          ),
          bounds.height
        )
      );
    },
    [clearDeleteHoldTimer, getFloorBounds]
  );

  const handleGlobalPointerUp = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }

    const bounds = getFloorBounds();
    const draggedMovieId = drag.id;
    const shouldDelete =
      deleteArmedIdRef.current === draggedMovieId && deleteInZoneRef.current;

    dragRef.current = null;
    setDraggingId(null);
    clearDeleteHoldTimer();
    deleteInZoneRef.current = false;
    deleteHoldMovieIdRef.current = null;
    setDeleteCandidateId(null);
    setDeleteArmedId(null);

    if (shouldDelete) {
      const removedMovie =
        floorMovies.find((movie) => movie.id === draggedMovieId) ?? null;
      setFloorMovies((previous) =>
        recalculateHierarchy(
          previous.filter((movie) => movie.id !== draggedMovieId),
          bounds.height
        )
      );

      if (removedMovie && !isWaitingSlotCover(removedMovie.coverImage)) {
        clearDeleteAnimationTimers();
        setDeleteAnimation({
          id: removedMovie.id,
          title: removedMovie.title,
          coverImage: removedMovie.coverImage,
          x: removedMovie.x,
          y: removedMovie.y,
          rotation: clampCardRotation(removedMovie.rotation),
          z: Math.max(1400, removedMovie.z + 4),
          splitDirection: Math.random() < 0.5 ? 1 : -1,
          stage: 'cut',
        });

        deleteCutTimerRef.current = window.setTimeout(() => {
          setDeleteAnimation((current) =>
            current && current.id === draggedMovieId
              ? { ...current, stage: 'hold' }
              : current
          );
        }, DELETE_CUT_MS);

        deleteDropTimerRef.current = window.setTimeout(() => {
          setDeleteAnimation((current) =>
            current && current.id === draggedMovieId
              ? { ...current, stage: 'drop' }
              : current
          );
        }, DELETE_CUT_MS + DELETE_POST_CUT_HOLD_MS);

        deleteCleanupTimerRef.current = window.setTimeout(() => {
          setDeleteAnimation((current) =>
            current && current.id === draggedMovieId ? null : current
          );
        }, DELETE_CUT_MS + DELETE_POST_CUT_HOLD_MS + DELETE_DROP_MS);
      }

      setSourceMovies((previous) =>
        previous.filter((movie) => movie.id !== draggedMovieId)
      );
      setPreviewCoverByMovieId((previous) => {
        const stalePreview = previous[draggedMovieId];
        if (stalePreview) {
          URL.revokeObjectURL(stalePreview);
        }

        const { [draggedMovieId]: _removed, ...rest } = previous;
        return rest;
      });
      setPreviewTierByMovieId((previous) => {
        const { [draggedMovieId]: _removed, ...rest } = previous;
        return rest;
      });
      delete renderedCoverPromiseByMovieIdRef.current[draggedMovieId];
      return;
    }

    setFloorMovies((previous) => recalculateHierarchy(previous, bounds.height));
  }, [
    clearDeleteAnimationTimers,
    clearDeleteHoldTimer,
    floorMovies,
    getFloorBounds,
  ]);

  useEffect(() => {
    window.addEventListener('pointermove', handleGlobalPointerMove);
    window.addEventListener('pointerup', handleGlobalPointerUp);

    return () => {
      window.removeEventListener('pointermove', handleGlobalPointerMove);
      window.removeEventListener('pointerup', handleGlobalPointerUp);
    };
  }, [handleGlobalPointerMove, handleGlobalPointerUp]);

  useEffect(() => {
    const leader = [...floorMovies].sort((a, b) => a.rank - b.rank)[0];
    leaderIdRef.current = leader?.id ?? null;

    (window as Window & { __floorLeaderId?: number | null }).__floorLeaderId =
      leaderIdRef.current;
  }, [floorMovies]);

  useEffect(() => {
    if (!isInitialBoardLoaded) {
      return;
    }

    if (floorMovies.some((movie) => isWaitingSlotCover(movie.coverImage))) {
      return;
    }

    const boardMovies = toBoardMoviesPayload(floorMovies);

    const signature = JSON.stringify(
      boardMovies.map((movie) => [
        movie.id,
        movie.coverImage,
        Math.round(movie.x),
        Math.round(movie.y),
        Math.round(movie.rotation * 10) / 10,
        Math.round(movie.score * 10) / 10,
      ])
    );

    if (signature === lastBoardSignatureRef.current) {
      return;
    }

    if (boardSyncTimerRef.current !== null) {
      window.clearTimeout(boardSyncTimerRef.current);
      boardSyncTimerRef.current = null;
    }

    boardSyncTimerRef.current = window.setTimeout(() => {
      void fetch(`/api/club/floor?boardId=${FLOOR_BOARD_ID}`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          boardId: FLOOR_BOARD_ID,
          movies: boardMovies,
        }),
      })
        .then((response) => {
          if (response.ok) {
            lastBoardSignatureRef.current = signature;
          }
        })
        .catch(() => {
          // Keep UI responsive even if board sync fails.
        });
    }, BOARD_SYNC_DEBOUNCE_MS);

    return () => {
      if (boardSyncTimerRef.current !== null) {
        window.clearTimeout(boardSyncTimerRef.current);
        boardSyncTimerRef.current = null;
      }
    };
  }, [floorMovies, isInitialBoardLoaded]);

  useEffect(() => {
    return () => {
      for (const timer of animationTimersRef.current) {
        window.clearTimeout(timer);
      }
      animationTimersRef.current = [];
      if (addSlotResetRafRef.current !== null) {
        window.cancelAnimationFrame(addSlotResetRafRef.current);
        addSlotResetRafRef.current = null;
      }
      if (boardSyncTimerRef.current !== null) {
        window.clearTimeout(boardSyncTimerRef.current);
        boardSyncTimerRef.current = null;
      }
      clearDeleteHoldTimer();
      clearDeleteAnimationTimers();
    };
  }, [clearDeleteAnimationTimers, clearDeleteHoldTimer]);

  useEffect(() => {
    previewCoverByMovieIdRef.current = previewCoverByMovieId;
  }, [previewCoverByMovieId]);

  useEffect(() => {
    previewTierByMovieIdRef.current = previewTierByMovieId;
  }, [previewTierByMovieId]);

  useEffect(() => {
    deleteCandidateIdRef.current = deleteCandidateId;
  }, [deleteCandidateId]);

  useEffect(() => {
    deleteArmedIdRef.current = deleteArmedId;
  }, [deleteArmedId]);

  useEffect(() => {
    return () => {
      for (const previewUrl of Object.values(previewCoverByMovieIdRef.current)) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, []);

  const handleEmptySlotClick = () => {
    setPendingSearch({
      query: '',
      results: [],
      selectedIndex: 0,
      loading: false,
    });
    setIsAddSlotPeek(true);
  };

  const getAddSlotOffset = useCallback(() => {
    if (pendingSearch) {
      return 0;
    }

    if (isAddSlotPeek) {
      return ADD_SLOT_HOVER_OFFSET;
    }

    return ADD_SLOT_HIDDEN_OFFSET;
  }, [isAddSlotPeek, pendingSearch]);

  const fetchSearchPreviewCover = useCallback(
    async (
      movie: SearchMovie,
      tier: SearchPreviewTier,
      signal: AbortSignal
    ): Promise<string | null> => {
      const sourceUrl = movie.posterUrl ?? movie.backdropUrl;
      if (!sourceUrl) {
        return null;
      }

      const previewStep = getSearchPreviewStep(tier);

      const response = await fetch('/api/vhs/render', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sourceUrl,
          templateId: COVER_TEMPLATE_ID,
          width: previewStep.size,
          height: previewStep.size,
          fit: 'cover',
          format: 'webp',
          quality: previewStep.quality,
          background: 'transparent',
          randomSeed: `movie-${movie.id}`,
        }),
        signal,
      });

      if (!response.ok) {
        return null;
      }

      const previewBlob = await response.blob();
      return URL.createObjectURL(previewBlob);
    },
    []
  );

  const fetchRenderedCoverForMovie = useCallback(async (movieId: number) => {
    const params = new URLSearchParams({
      movieId: String(movieId),
      limit: '1',
      renderer: 'sharp',
      templateId: COVER_TEMPLATE_ID,
    });

    const response = await fetch(`/api/vhs/covers?${params.toString()}`);
    if (!response.ok) {
      return null;
    }

    const payloadRaw: unknown = await response.json();
    if (!isCoversResponse(payloadRaw) || payloadRaw.movies.length === 0) {
      return null;
    }

    return payloadRaw.movies[0] ?? null;
  }, []);

  const getRenderedCoverPromise = useCallback(
    (movieId: number): Promise<ClubMovie | null> => {
      const existing = renderedCoverPromiseByMovieIdRef.current[movieId];
      if (existing) {
        return existing;
      }

      const promise = fetchRenderedCoverForMovie(movieId).catch(() => null);
      renderedCoverPromiseByMovieIdRef.current[movieId] = promise;
      return promise;
    },
    [fetchRenderedCoverForMovie]
  );

  const confirmPendingSearch = useCallback(async () => {
    if (!pendingSearch) {
      return;
    }

    const selectedMovie = pendingSearch.results[pendingSearch.selectedIndex];
    if (!selectedMovie) {
      return;
    }

    const slot = getEmptySlotPosition();
    const slotOffsetY = getAddSlotOffset();
    const targetX = clamp(
      slot.x - CARD_WIDTH * (0.78 + Math.random() * 0.92),
      0,
      Math.max(0, getFloorBounds().width - CARD_WIDTH)
    );
    const targetY = clamp(
      slot.y - CARD_HEIGHT * (0.08 + Math.random() * 0.58),
      0,
      Math.max(0, getFloorBounds().height - CARD_HEIGHT)
    );
    const targetRotation = getRandomCardRotation();
    const selectedPreviewCover = previewCoverByMovieId[selectedMovie.id] ?? null;
    const throwCoverImage =
      selectedPreviewCover ??
      activeSearchCover ??
      WAITING_SLOT_IMAGE;
    const fallbackMovie: ClubMovie = {
      id: selectedMovie.id,
      title: selectedMovie.title,
      coverImage: throwCoverImage,
    };
    const renderedCoverPromise = getRenderedCoverPromise(selectedMovie.id);

    setPendingSearch(null);
    setIsAddSlotPeek(false);
    setIsAddSlotResetAnimating(true);
    if (addSlotResetRafRef.current !== null) {
      window.cancelAnimationFrame(addSlotResetRafRef.current);
    }
    addSlotResetRafRef.current = window.requestAnimationFrame(() => {
      setIsAddSlotResetAnimating(false);
      addSlotResetRafRef.current = null;
    });

    for (const timer of animationTimersRef.current) {
      window.clearTimeout(timer);
    }
    animationTimersRef.current = [];

    setAddAnimation({
      movie: fallbackMovie,
      coverImage: throwCoverImage,
      fromX: slot.x,
      fromY: slot.y + slotOffsetY,
      toX: targetX,
      toY: targetY,
      toRotation: targetRotation,
      stage: 'insert',
    });

    const flyTimer = window.setTimeout(() => {
      setAddAnimation((current) =>
        current
          ? {
              ...current,
              stage: 'fly',
            }
          : current
      );
    }, 180);

    const finishTimer = window.setTimeout(() => {
      addMovieToFloor(fallbackMovie, targetX, targetY, targetRotation);
      setAddAnimation(null);
      void renderedCoverPromise.then((renderedCover) => {
        if (!renderedCover || renderedCover.coverImage === fallbackMovie.coverImage) {
          return;
        }

        setFloorMovies((previous) =>
          previous.map((movie) =>
            movie.id === renderedCover.id
              ? {
                  ...movie,
                  title: renderedCover.title,
                  coverImage: renderedCover.coverImage,
                }
              : movie
          )
        );
      });
    }, 900);

    animationTimersRef.current.push(flyTimer, finishTimer);
  }, [
    addMovieToFloor,
    activeSearchCover,
    getRenderedCoverPromise,
    getAddSlotOffset,
    getEmptySlotPosition,
    getFloorBounds,
    pendingSearch,
    previewCoverByMovieId,
  ]);

  useEffect(() => {
    if (!pendingSearch) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        setPendingSearch(null);
        setIsAddSlotPeek(false);
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        void confirmPendingSearch();
        return;
      }

      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        setPendingSearch((current) => {
          if (!current || current.results.length === 0) {
            return current;
          }

          return {
            ...current,
            selectedIndex: (current.selectedIndex + 1) % current.results.length,
          };
        });
        return;
      }

      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        setPendingSearch((current) => {
          if (!current || current.results.length === 0) {
            return current;
          }

          return {
            ...current,
            selectedIndex:
              (current.selectedIndex - 1 + current.results.length) %
              current.results.length,
          };
        });
        return;
      }

      if (event.key === 'Backspace') {
        event.preventDefault();
        setPendingSearch((current) =>
          current
            ? {
                ...current,
                query: current.query.slice(0, -1),
                selectedIndex: 0,
              }
            : current
        );
        return;
      }

      if (event.key.length !== 1) {
        return;
      }

      event.preventDefault();
      setPendingSearch((current) =>
        current
          ? {
              ...current,
              query: `${current.query}${event.key}`,
              selectedIndex: 0,
            }
          : current
      );
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [confirmPendingSearch, pendingSearch]);

  useEffect(() => {
    if (!pendingSearch) {
      return;
    }

    const selectedMovie = pendingSearch.results[pendingSearch.selectedIndex];
    if (!selectedMovie) {
      return;
    }

    void getRenderedCoverPromise(selectedMovie.id);
  }, [getRenderedCoverPromise, pendingSearch]);

  useEffect(() => {
    if (!pendingSearch) {
      return;
    }

    const selectedMovie = pendingSearch.results[pendingSearch.selectedIndex];
    if (!selectedMovie) {
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    const setPreview = (previewUrl: string, tier: SearchPreviewTier) => {
      const nextTierIndex = getSearchPreviewTierIndex(tier);
      const currentTierIndex = getSearchPreviewTierIndex(
        previewTierByMovieIdRef.current[selectedMovie.id]
      );

      if (currentTierIndex > nextTierIndex) {
        URL.revokeObjectURL(previewUrl);
        return;
      }

      setPreviewCoverByMovieId((current) => {
        const existing = current[selectedMovie.id];
        if (existing && existing !== previewUrl) {
          URL.revokeObjectURL(existing);
        }

        return {
          ...current,
          [selectedMovie.id]: previewUrl,
        };
      });

      setPreviewTierByMovieId((current) => ({
        ...current,
        [selectedMovie.id]: tier,
      }));
    };

    const requestPreview = async (tier: SearchPreviewTier) => {
      const previewUrl = await fetchSearchPreviewCover(
        selectedMovie,
        tier,
        controller.signal
      );

      if (!previewUrl || cancelled || controller.signal.aborted) {
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
        }
        return;
      }

      setPreview(previewUrl, tier);
    };

    void (async () => {
      const currentTier = previewTierByMovieIdRef.current[selectedMovie.id];
      const hasAnyPreview = Boolean(previewCoverByMovieIdRef.current[selectedMovie.id]);
      const startIndex = hasAnyPreview
        ? getSearchPreviewTierIndex(currentTier) + 1
        : 0;

      const tiersToFetch = SEARCH_PREVIEW_STEPS.slice(Math.max(0, startIndex))
        .map((step) => step.tier)
        .filter((tier) => {
          const alreadyTier = previewTierByMovieIdRef.current[selectedMovie.id];
          return getSearchPreviewTierIndex(alreadyTier) < getSearchPreviewTierIndex(tier);
        });

      await Promise.all(tiersToFetch.map((tier) => requestPreview(tier)));
    })().catch(() => {
      // Ignore preview failures and keep available preview.
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    fetchSearchPreviewCover,
    pendingSearch,
  ]);

  useEffect(() => {
    if (!pendingSearch) {
      setActiveSearchCover(null);
      return;
    }

    const selectedMovie = pendingSearch.results[pendingSearch.selectedIndex];
    if (!selectedMovie) {
      if (!pendingSearch.loading) {
        setActiveSearchCover(null);
      }
      return;
    }

    const selectedPreview = previewCoverByMovieId[selectedMovie.id];
    if (!selectedPreview) {
      return;
    }

    setActiveSearchCover(selectedPreview);
  }, [pendingSearch, previewCoverByMovieId]);

  const emptySlot = getEmptySlotPosition();
  const selectedSearchMovie =
    pendingSearch?.results[pendingSearch.selectedIndex] ?? null;
  const selectedSearchPreviewCover =
    selectedSearchMovie ? previewCoverByMovieId[selectedSearchMovie.id] : undefined;
  const addSlotCoverImage =
    selectedSearchPreviewCover ?? activeSearchCover ?? WAITING_SLOT_IMAGE;
  const addSlotHasCoverImage = Boolean(addSlotCoverImage);
  const visibleFloorMovies = floorMovies.filter(
    (movie) => !isWaitingSlotCover(movie.coverImage)
  );
  const addSlotOffset = getAddSlotOffset();
  const remoteTop =
    getFloorBounds().height -
    (isRemotePeek ? REMOTE_VISIBLE_PEEK : REMOTE_VISIBLE_DEFAULT);
  const remoteLeft = clamp(
    emptySlot.x - REMOTE_CONTROL_WIDTH - REMOTE_SLOT_GAP,
    12,
    Math.max(12, getFloorBounds().width - REMOTE_CONTROL_WIDTH - 12)
  );

  const handlePowerOnClick = () => {
    const boardMovies = toBoardMoviesPayload(floorMovies);
    const signature = JSON.stringify(
      boardMovies.map((movie) => [
        movie.id,
        movie.coverImage,
        Math.round(movie.x),
        Math.round(movie.y),
        Math.round(movie.rotation * 10) / 10,
        Math.round(movie.score * 10) / 10,
      ])
    );

    const navigateToTv = () => {
      window.location.href = '/';
    };

    if (signature === lastBoardSignatureRef.current) {
      navigateToTv();
      return;
    }

    void fetch(`/api/club/floor?boardId=${FLOOR_BOARD_ID}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        boardId: FLOOR_BOARD_ID,
        movies: boardMovies,
      }),
      keepalive: true,
    })
      .then((response) => {
        if (response.ok) {
          lastBoardSignatureRef.current = signature;
        }
      })
      .catch(() => {
        // Navigate anyway; board sync can retry on next interaction.
      })
      .finally(() => {
        navigateToTv();
      });
  };

  return (
    <main className="h-screen w-full overflow-hidden bg-white">
      <div
        ref={floorRef}
        className="relative h-full w-full bg-cover bg-center"
        style={{ backgroundImage: "url('/VHS/backgrounds/floor-oak.png')" }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(860px 560px at ${Math.round(
              emptySlot.x + CARD_WIDTH * 0.52
            )}px ${Math.round(
              emptySlot.y + CARD_HEIGHT * 0.78
            )}px, rgba(255,228,184,0.32) 0%, rgba(255,228,184,0.12) 36%, rgba(255,228,184,0) 72%)`,
            boxShadow: 'inset 0 0 110px rgba(0,0,0,0.06)',
          }}
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: 0.08,
            backgroundImage:
              'repeating-linear-gradient(to bottom, rgba(255,255,255,0.08), rgba(255,255,255,0.08) 1px, rgba(0,0,0,0) 4px, rgba(0,0,0,0) 8px), repeating-linear-gradient(to right, rgba(0,0,0,0.03), rgba(0,0,0,0.03) 1px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 5px)',
          }}
        />
        {draggingId !== null ? (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0"
            style={{
              height: DELETE_ZONE_HEIGHT + 42,
              zIndex: 5,
              opacity:
                deleteArmedId === draggingId
                  ? 0.9
                  : deleteCandidateId === draggingId
                    ? 0.58
                    : 0.3,
              transition: 'opacity 160ms ease-out',
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                background:
                  deleteArmedId === draggingId
                    ? 'linear-gradient(to top, rgba(196, 24, 24, 0.44) 0%, rgba(196, 24, 24, 0.2) 48%, rgba(196, 24, 24, 0) 100%)'
                    : 'linear-gradient(to top, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0.12) 54%, rgba(0,0,0,0) 100%)',
              }}
            />
          </div>
        ) : null}
        {visibleFloorMovies.map((movie) => {
          const dragging = draggingId === movie.id;
          const deleteCandidate = dragging && deleteCandidateId === movie.id;
          const deleteArmed = dragging && deleteArmedId === movie.id;

          return (
            <button
              key={movie.id}
              type="button"
              onPointerDown={(event) => handlePointerDown(event, movie.id)}
              className={`absolute group appearance-none border-0 bg-transparent p-0 text-left ${
                dragging ? 'cursor-grabbing' : 'cursor-grab'
              }`}
              style={{
                width: CARD_WIDTH,
                height: CARD_HEIGHT,
                left: movie.x,
                top: movie.y,
                zIndex: movie.z,
                transform: `rotate(${movie.rotation}deg)`,
                touchAction: 'none',
              }}
            >
              <div
                className={`relative h-full w-full transform transition-transform duration-300 ${
                  dragging ? '' : 'group-hover:rotate-1 group-hover:scale-110'
                } ${
                  deleteArmed
                    ? 'vhs-delete-shake-hard'
                    : deleteCandidate
                      ? 'vhs-delete-shake'
                      : ''
                }`}
              >
                <div
                  className={`pointer-events-none absolute inset-[-10%] z-0 rounded-[26px] blur-[10px] transition-opacity duration-300 ${
                    dragging
                      ? 'opacity-72'
                      : 'opacity-48 group-hover:opacity-72'
                  }`}
                  style={{
                    background:
                      'radial-gradient(70% 74% at 48% 58%, rgba(0,0,0,0.58) 0%, rgba(0,0,0,0.28) 44%, rgba(0,0,0,0) 80%)',
                  }}
                />
                {OPEN_EFFECT_ENABLED ? (
                  <div
                    className={`absolute -bottom-4 -right-4 -left-[-20%] h-[102%] transition-all duration-300 ${
                      dragging
                        ? 'opacity-0 -translate-x-[20%]'
                        : 'opacity-0 -translate-x-[20%] group-hover:translate-x-0 group-hover:opacity-100'
                    }`}
                  >
                    <img
                      src="/VHS/Front Side.png"
                      alt="VHS case"
                      className="h-full w-full object-cover"
                      draggable={false}
                    />
                  </div>
                ) : null}
                <img
                  src={movie.coverImage}
                  alt={movie.title}
                  className={`relative z-10 h-full w-full object-cover transition-[filter] duration-300 ${
                    dragging
                      ? 'drop-shadow-[0_30px_34px_rgba(0,0,0,0.54)] drop-shadow-[0_10px_16px_rgba(0,0,0,0.26)]'
                      : 'drop-shadow-[0_20px_24px_rgba(0,0,0,0.44)] drop-shadow-[0_7px_14px_rgba(0,0,0,0.2)] group-hover:drop-shadow-[0_32px_38px_rgba(0,0,0,0.6)] group-hover:drop-shadow-[0_10px_20px_rgba(0,0,0,0.3)]'
                  }`}
                  draggable={false}
                />
              </div>
            </button>
          );
        })}

        {deleteAnimation ? (
          <div
            className="pointer-events-none absolute"
            style={{
              width: CARD_WIDTH,
              height: CARD_HEIGHT,
              left: deleteAnimation.x,
              top: deleteAnimation.y,
              zIndex: deleteAnimation.z,
              transform: `rotate(${deleteAnimation.rotation}deg)`,
            }}
          >
            <div className="absolute inset-0">
              <div
                className="absolute inset-0 overflow-hidden"
                style={{
                  clipPath: `polygon(0 0, 100% 0, 100% ${DELETE_SPLIT_RIGHT_PCT}%, 0 ${DELETE_SPLIT_LEFT_PCT}%)`,
                  transform:
                    deleteAnimation.stage === 'drop'
                      ? `translate3d(${
                          -22 * deleteAnimation.splitDirection
                        }px, 312px, 0) rotate(${
                          -13 * deleteAnimation.splitDirection
                        }deg)`
                      : deleteAnimation.stage === 'hold'
                        ? `translate3d(${
                            -2 * deleteAnimation.splitDirection
                          }px, -6px, 0) rotate(${
                            -1.2 * deleteAnimation.splitDirection
                          }deg)`
                        : 'translate3d(0, 0, 0)',
                  transition:
                    'transform 820ms cubic-bezier(0.16, 0.84, 0.22, 1), opacity 820ms ease-out',
                  opacity: deleteAnimation.stage === 'drop' ? 0 : 1,
                }}
              >
                <img
                  src={deleteAnimation.coverImage}
                  alt={deleteAnimation.title}
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              </div>
              <div
                className="absolute inset-0 overflow-hidden"
                style={{
                  clipPath: `polygon(0 ${DELETE_SPLIT_LEFT_PCT}%, 100% ${DELETE_SPLIT_RIGHT_PCT}%, 100% 100%, 0 100%)`,
                  transform:
                    deleteAnimation.stage === 'drop'
                      ? `translate3d(${
                          22 * deleteAnimation.splitDirection
                        }px, 312px, 0) rotate(${
                          14 * deleteAnimation.splitDirection
                        }deg)`
                      : deleteAnimation.stage === 'hold'
                        ? `translate3d(${
                            3 * deleteAnimation.splitDirection
                          }px, 7px, 0) rotate(${
                            1.4 * deleteAnimation.splitDirection
                          }deg)`
                        : 'translate3d(0, 0, 0)',
                  transition:
                    'transform 820ms cubic-bezier(0.16, 0.84, 0.22, 1), opacity 820ms ease-out',
                  opacity: deleteAnimation.stage === 'drop' ? 0 : 1,
                }}
              >
                <img
                  src={deleteAnimation.coverImage}
                  alt={deleteAnimation.title}
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              </div>
              <div
                className={`absolute left-[-34%] top-[48%] h-[2px] w-[170%] ${
                  deleteAnimation.splitDirection === -1
                    ? 'vhs-delete-samurai-line-reverse'
                    : 'vhs-delete-samurai-line'
                }`}
                style={{
                  top: `${DELETE_SPLIT_LINE_TOP_PCT}%`,
                  opacity: deleteAnimation.stage === 'cut' ? 1 : 0,
                }}
              />
            </div>
          </div>
        ) : null}

        {addAnimation ? (
          <div
            className="pointer-events-none absolute"
            style={{
              width: CARD_WIDTH,
              height: CARD_HEIGHT,
              left: addAnimation.stage === 'fly' ? addAnimation.toX : addAnimation.fromX,
              top: addAnimation.stage === 'fly' ? addAnimation.toY : addAnimation.fromY,
              zIndex: 1400,
              transform: `rotate(${addAnimation.stage === 'fly' ? addAnimation.toRotation : 5}deg)`,
              transition:
                addAnimation.stage === 'fly'
                  ? 'left 520ms cubic-bezier(0.2, 0.85, 0.2, 1), top 520ms cubic-bezier(0.2, 0.85, 0.2, 1), transform 520ms cubic-bezier(0.2, 0.85, 0.2, 1), opacity 220ms ease-out'
                  : 'none',
              filter:
                addAnimation.stage === 'fly'
                  ? 'drop-shadow(0 34px 36px rgba(0, 0, 0, 0.56)) drop-shadow(0 10px 16px rgba(0, 0, 0, 0.28))'
                  : 'drop-shadow(0 24px 26px rgba(0, 0, 0, 0.42)) drop-shadow(0 8px 14px rgba(0, 0, 0, 0.2))',
            }}
          >
            <img
              src={addAnimation.coverImage}
              alt={addAnimation.movie.title}
              className="absolute inset-0 h-full w-full object-cover transition-opacity duration-200"
              style={{
                opacity: addAnimation.stage === 'insert' ? 0.92 : 1,
              }}
              draggable={false}
            />
            <div
              className="absolute inset-0 transition-opacity duration-200"
              style={{
                opacity: addAnimation.stage === 'insert' ? 0 : 0.13,
                background:
                  'linear-gradient(132deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 56%)',
              }}
            />
            <div
              className="absolute inset-0 transition-opacity duration-200"
              style={{
                opacity: addAnimation.stage === 'insert' ? 0 : 0.09,
                background:
                  'repeating-linear-gradient(to bottom, rgba(255,255,255,0.11), rgba(255,255,255,0.11) 1px, rgba(0,0,0,0) 4px, rgba(0,0,0,0) 8px)',
              }}
            />
            <img
              src={addAnimation.coverImage}
              alt={addAnimation.movie.title}
              className="absolute inset-0 h-full w-full object-cover transition-opacity duration-200"
              style={{
                opacity: addAnimation.stage === 'insert' ? 0 : 0.18,
                mixBlendMode: 'screen',
              }}
              draggable={false}
            />
            <img
              src={addAnimation.coverImage}
              alt={addAnimation.movie.title}
              className="absolute inset-0 h-full w-full object-cover transition-opacity duration-200"
              style={{
                opacity: addAnimation.stage === 'insert' ? 0 : 0.1,
                mixBlendMode: 'overlay',
              }}
              draggable={false}
            />
          </div>
        ) : null}

        <button
          type="button"
          onClick={handleEmptySlotClick}
          onMouseEnter={() => setIsAddSlotPeek(true)}
          onMouseLeave={() => setIsAddSlotPeek(false)}
          onFocus={() => setIsAddSlotPeek(true)}
          onBlur={() => setIsAddSlotPeek(false)}
          className="absolute group cursor-pointer appearance-none border-0 bg-transparent p-0 text-left"
          style={{
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
            left: emptySlot.x,
            top: emptySlot.y + addSlotOffset,
            zIndex: 999,
            transform: isAddSlotResetAnimating
              ? 'rotate(5deg) translateY(132px)'
              : 'rotate(5deg)',
            transition:
              'transform 320ms cubic-bezier(0.2, 0.85, 0.2, 1), top 230ms cubic-bezier(0.2, 0.85, 0.2, 1)',
          }}
        >
          <div
            className={`relative h-full w-full transform transition-transform duration-300 ${
              pendingSearch || isAddSlotPeek
                ? 'scale-[1.02]'
                : 'group-hover:scale-[1.02] group-hover:-translate-y-1'
            }`}
          >
            <div
              className={`absolute inset-0 rounded-[2px] transition-[filter,opacity,background-color] duration-300 ${
                addSlotHasCoverImage
                  ? 'bg-transparent drop-shadow-[0_28px_34px_rgba(0,0,0,0.52)] drop-shadow-[0_8px_14px_rgba(0,0,0,0.22)]'
                  : 'bg-white drop-shadow-[0_18px_24px_rgba(0,0,0,0.34)] drop-shadow-[0_6px_10px_rgba(0,0,0,0.18)]'
              }`}
            />
            {addSlotCoverImage ? (
              <img
                src={addSlotCoverImage}
                alt={selectedSearchMovie?.title ?? 'Movie preview'}
                className="absolute inset-0 h-full w-full object-cover transition-[filter,opacity] duration-300"
                draggable={false}
              />
            ) : null}
          </div>
        </button>
        <button
          type="button"
          aria-label="Fjernkontroll - skru på TV"
          onClick={handlePowerOnClick}
          onMouseEnter={() => setIsRemotePeek(true)}
          onMouseLeave={() => setIsRemotePeek(false)}
          onFocus={() => setIsRemotePeek(true)}
          onBlur={() => setIsRemotePeek(false)}
          className="absolute z-[1200] appearance-none border-0 bg-transparent p-0"
          style={{
            width: REMOTE_CONTROL_WIDTH,
            height: REMOTE_CONTROL_HEIGHT,
            left: remoteLeft,
            top: remoteTop,
            transition:
              'top 230ms cubic-bezier(0.2, 0.85, 0.2, 1), transform 220ms cubic-bezier(0.2, 0.85, 0.2, 1)',
            transform: isRemotePeek ? 'translateY(-2px)' : 'translateY(0)',
          }}
        >
          <img
            src={REMOTE_CONTROL_IMAGE}
            alt="Fjernkontroll"
            className="h-full w-full object-contain drop-shadow-[0_14px_20px_rgba(0,0,0,0.35)] transition-[filter] duration-200 hover:drop-shadow-[0_20px_28px_rgba(0,0,0,0.45)]"
            draggable={false}
          />
        </button>
        {pendingSearch ? (
          <div
            className="pointer-events-none absolute z-[1200] w-[42vw] max-w-[620px] min-w-[220px] text-right text-white"
            style={{
              left: Math.max(16, emptySlot.x - 640),
              bottom: 56,
              textShadow: '0 2px 14px rgba(0,0,0,0.45)',
            }}
          >
            <div className="truncate text-[clamp(28px,4.6vw,72px)] font-semibold leading-[0.9] tracking-[0.02em] uppercase">
              {pendingSearch.query || ' '}
              <span
                className="ml-1 inline-block align-baseline animate-pulse"
                aria-hidden
              >
                _
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
};

export default FloorPage;
