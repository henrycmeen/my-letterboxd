import { type NextPage } from 'next';
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { withBasePath } from '@/lib/basePath';

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

interface FloorBoardConflictResponse {
  message: string;
  expectedVersion?: number;
  currentVersion?: number;
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

interface VsPair {
  firstId: number;
  secondId: number;
}

interface ProximityVsCharge {
  pair: VsPair;
  progress: number;
}

interface VsFightState {
  pair: VsPair;
  stage: 'countdown' | 'lunge' | 'impact' | 'ko';
  countdown: 3 | 2 | 1 | 0;
  winnerId: number | null;
  loserId: number | null;
}

const CARD_WIDTH = 260;
const CARD_HEIGHT = 390;
const WAITING_SLOT_IMAGE = withBasePath('/VHS/templates/waiting-cover-vhs-black.webp');
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
const REMOTE_CONTROL_IMAGE = withBasePath('/VHS/ui/remote-control.webp');
const VS_BADGE_IMAGE = withBasePath('/VHS/ui/vs.png');
const VHS_FRONT_SIDE_IMAGE = withBasePath('/VHS/Front Side.png');
const FLOOR_BACKGROUND_IMAGE = withBasePath('/VHS/backgrounds/floor-oak.png');
const GENERATED_COVER_API_PATH = withBasePath('/api/vhs/generated/');
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
const VS_BADGE_WIDTH = 132;
const VS_BADGE_HEIGHT = Math.round((387 / 512) * VS_BADGE_WIDTH);
const TOP_SCORE_TIE_MIN = 100;
const PROXIMITY_VS_HOLD_MS = 2000;
const PROXIMITY_VS_TRIGGER_RADIUS = 170;
const PROXIMITY_VS_BREAK_RADIUS = 300;
const PROXIMITY_VS_PULL_MAX = 18;

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

const createVsPair = (movieAId: number, movieBId: number): VsPair =>
  movieAId < movieBId
    ? { firstId: movieAId, secondId: movieBId }
    : { firstId: movieBId, secondId: movieAId };

const isSameVsPair = (left: VsPair | null, right: VsPair | null): boolean => {
  if (!left || !right) {
    return false;
  }

  return left.firstId === right.firstId && left.secondId === right.secondId;
};

const pairHasMovie = (pair: VsPair | null, movieId: number): boolean =>
  Boolean(pair && (pair.firstId === movieId || pair.secondId === movieId));

const getVsPairKey = (pair: VsPair): string => `${pair.firstId}-${pair.secondId}`;

const hasVsPair = (pairs: VsPair[], candidate: VsPair): boolean =>
  pairs.some((pair) => isSameVsPair(pair, candidate));

const getSearchPreviewStep = (tier: SearchPreviewTier) =>
  SEARCH_PREVIEW_STEPS.find((step) => step.tier === tier) ??
  SEARCH_PREVIEW_STEPS[0]!;

const getSearchPreviewTierIndex = (tier?: SearchPreviewTier): number =>
  tier ? SEARCH_PREVIEW_STEPS.findIndex((step) => step.tier === tier) : -1;

const getSearchMovieSourceImage = (movie: SearchMovie): string | null =>
  movie.posterUrl ?? movie.backdropUrl ?? null;

const isWaitingSlotCover = (coverImage: string): boolean =>
  coverImage.includes('waiting-cover-vhs-black.webp') ||
  coverImage.includes('waiting-cover-vhs.webp') ||
  coverImage.includes('waiting-cover-white.svg') ||
  coverImage.includes('front-placeholder-cover') ||
  coverImage.includes('front-side-cover-flat.webp');

const isGeneratedCoverPath = (coverImage: string): boolean =>
  coverImage.includes('/VHS/generated/') ||
  coverImage.includes('/api/vhs/generated/') ||
  coverImage.includes(GENERATED_COVER_API_PATH);

const shouldHydrateBoardCover = (coverImage: string): boolean =>
  isWaitingSlotCover(coverImage) ||
  coverImage.startsWith('http://') ||
  coverImage.startsWith('https://') ||
  (isGeneratedCoverPath(coverImage) &&
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

const buildBoardSignature = (
  boardMovies: ReturnType<typeof toBoardMoviesPayload>
): string =>
  JSON.stringify(
    boardMovies.map((movie) => [
      movie.id,
      movie.coverImage,
      Math.round(movie.x),
      Math.round(movie.y),
      Math.round(movie.rotation * 10) / 10,
      Math.round(movie.score * 10) / 10,
    ])
  );

const isFloorBoardConflictResponse = (
  value: unknown
): value is FloorBoardConflictResponse => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Partial<FloorBoardConflictResponse>;
  const expectedValid =
    payload.expectedVersion === undefined ||
    (typeof payload.expectedVersion === 'number' &&
      Number.isFinite(payload.expectedVersion));
  const currentValid =
    payload.currentVersion === undefined ||
    (typeof payload.currentVersion === 'number' &&
      Number.isFinite(payload.currentVersion));

  return typeof payload.message === 'string' && expectedValid && currentValid;
};

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
  const [resolvingVsPairByKey, setResolvingVsPairByKey] = useState<
    Record<string, true>
  >({});
  const [proximityVsPairs, setProximityVsPairs] = useState<VsPair[]>([]);
  const [proximityVsCharge, setProximityVsCharge] =
    useState<ProximityVsCharge | null>(null);
  const [vsFightByKey, setVsFightByKey] = useState<Record<string, VsFightState>>({});

  const floorRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const floorMoviesRef = useRef<FloorMovie[]>([]);
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
  const resolvingVsPairByKeyRef = useRef<Record<string, true>>({});
  const vsFightByKeyRef = useRef<Record<string, VsFightState>>({});
  const vsFightTimersRef = useRef<number[]>([]);
  const proximityVsPairsRef = useRef<VsPair[]>([]);
  const proximityVsCandidatePairRef = useRef<VsPair | null>(null);
  const proximityVsHoldTimerRef = useRef<number | null>(null);
  const proximityVsChargeRafRef = useRef<number | null>(null);
  const renderedCoverPromiseByMovieIdRef = useRef<
    Record<number, Promise<ClubMovie | null>>
  >({});
  const boardVersionRef = useRef<number | null>(null);

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
        const boardResponse = await fetch(
          withBasePath(`/api/club/floor?boardId=${FLOOR_BOARD_ID}`)
        );
        if (boardResponse.ok) {
          const boardRaw: unknown = await boardResponse.json();
          if (isFloorBoardResponse(boardRaw) && !ignore) {
            boardVersionRef.current = boardRaw.version;
            if (boardRaw.movies.length > 0) {
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

              const signature = buildBoardSignature(toBoardMoviesPayload(restoredMovies));
              lastBoardSignatureRef.current = signature;
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
                      const response = await fetch(
                        withBasePath(`/api/vhs/covers?${params.toString()}`)
                      );
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

        const response = await fetch(withBasePath(`/api/vhs/covers?${params.toString()}`));
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

          const response = await fetch(withBasePath(`/api/tmdb/search?${params.toString()}`));
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

  const clearProximityVsHoldTimer = useCallback(() => {
    if (proximityVsHoldTimerRef.current !== null) {
      window.clearTimeout(proximityVsHoldTimerRef.current);
      proximityVsHoldTimerRef.current = null;
    }
  }, []);

  const clearProximityVsChargeAnimation = useCallback(() => {
    if (proximityVsChargeRafRef.current !== null) {
      window.cancelAnimationFrame(proximityVsChargeRafRef.current);
      proximityVsChargeRafRef.current = null;
    }
  }, []);

  const startProximityVsChargeAnimation = useCallback(
    (pair: VsPair) => {
      clearProximityVsChargeAnimation();
      const startedAt = performance.now();
      setProximityVsCharge({ pair, progress: 0 });

      const animate = () => {
        const activeCandidate = proximityVsCandidatePairRef.current;
        if (!isSameVsPair(activeCandidate, pair)) {
          setProximityVsCharge((current) =>
            current && isSameVsPair(current.pair, pair) ? null : current
          );
          return;
        }

        const elapsedMs = performance.now() - startedAt;
        const progress = clamp(elapsedMs / PROXIMITY_VS_HOLD_MS, 0, 1);
        setProximityVsCharge((current) =>
          current && isSameVsPair(current.pair, pair)
            ? { ...current, progress }
            : current
        );

        if (progress < 1) {
          proximityVsChargeRafRef.current = window.requestAnimationFrame(animate);
        }
      };

      proximityVsChargeRafRef.current = window.requestAnimationFrame(animate);
    },
    [clearProximityVsChargeAnimation]
  );

  const resetProximityVsCandidate = useCallback(() => {
    clearProximityVsHoldTimer();
    clearProximityVsChargeAnimation();
    proximityVsCandidatePairRef.current = null;
    setProximityVsCharge(null);
  }, [clearProximityVsChargeAnimation, clearProximityVsHoldTimer]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>, id: number) => {
    const isMovieInFight = Object.values(vsFightByKeyRef.current).some((fight) =>
      pairHasMovie(fight.pair, id)
    );
    if (isMovieInFight) {
      return;
    }

    event.preventDefault();
    setPendingSearch(null);
    clearDeleteHoldTimer();
    resetProximityVsCandidate();
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
      const visibleMovies = floorMoviesRef.current.filter(
        (movie) => !isWaitingSlotCover(movie.coverImage)
      );
      const draggedCenterX = x + CARD_WIDTH * 0.5;
      const draggedCenterY = y + CARD_HEIGHT * 0.5;
      let nearestMovieId: number | null = null;
      let nearestDistance = Number.POSITIVE_INFINITY;

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

      for (const movie of visibleMovies) {
        if (movie.id === drag.id) {
          continue;
        }

        const centerX = movie.x + CARD_WIDTH * 0.5;
        const centerY = movie.y + CARD_HEIGHT * 0.5;
        const distance = Math.hypot(draggedCenterX - centerX, draggedCenterY - centerY);

        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestMovieId = movie.id;
        }
      }

      const activePairs = proximityVsPairsRef.current;
      if (activePairs.length > 0) {
        const movieById = new Map(visibleMovies.map((movie) => [movie.id, movie]));
        const remainingPairs = activePairs.filter((pair) => {
          if (!pairHasMovie(pair, drag.id)) {
            return true;
          }

          const otherMovieId = pair.firstId === drag.id ? pair.secondId : pair.firstId;
          const otherMovie = movieById.get(otherMovieId);
          if (!otherMovie) {
            return false;
          }

          const otherCenterX = otherMovie.x + CARD_WIDTH * 0.5;
          const otherCenterY = otherMovie.y + CARD_HEIGHT * 0.5;
          const pairDistance = Math.hypot(
            draggedCenterX - otherCenterX,
            draggedCenterY - otherCenterY
          );

          return pairDistance <= PROXIMITY_VS_BREAK_RADIUS;
        });

        if (remainingPairs.length !== activePairs.length) {
          setProximityVsPairs(remainingPairs);
        }
      }

      if (
        nearestMovieId !== null &&
        nearestDistance <= PROXIMITY_VS_TRIGGER_RADIUS
      ) {
        const nextPair = createVsPair(drag.id, nearestMovieId);
        const currentCandidate = proximityVsCandidatePairRef.current;

        if (!isSameVsPair(currentCandidate, nextPair)) {
          resetProximityVsCandidate();
          proximityVsCandidatePairRef.current = nextPair;
          startProximityVsChargeAnimation(nextPair);
          proximityVsHoldTimerRef.current = window.setTimeout(() => {
            const activeDragId = dragRef.current?.id ?? null;
            const activeCandidate = proximityVsCandidatePairRef.current;

            if (activeDragId === drag.id && isSameVsPair(activeCandidate, nextPair)) {
              setProximityVsPairs((current) =>
                hasVsPair(current, nextPair) ? current : [...current, nextPair]
              );
              resetProximityVsCandidate();
            }
          }, PROXIMITY_VS_HOLD_MS);
        }
      } else {
        resetProximityVsCandidate();
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
    [
      clearDeleteHoldTimer,
      getFloorBounds,
      resetProximityVsCandidate,
      startProximityVsChargeAnimation,
    ]
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
    resetProximityVsCandidate();
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
      setProximityVsPairs((current) =>
        current.filter((pair) => !pairHasMovie(pair, draggedMovieId))
      );
      delete renderedCoverPromiseByMovieIdRef.current[draggedMovieId];
      return;
    }

    setFloorMovies((previous) => recalculateHierarchy(previous, bounds.height));
  }, [
    clearDeleteAnimationTimers,
    clearDeleteHoldTimer,
    floorMovies,
    getFloorBounds,
    resetProximityVsCandidate,
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
    const signature = buildBoardSignature(boardMovies);

    if (signature === lastBoardSignatureRef.current) {
      return;
    }

    if (boardSyncTimerRef.current !== null) {
      window.clearTimeout(boardSyncTimerRef.current);
      boardSyncTimerRef.current = null;
    }

    boardSyncTimerRef.current = window.setTimeout(() => {
      const syncBoard = async (): Promise<void> => {
        const requestBody = {
          boardId: FLOOR_BOARD_ID,
          movies: boardMovies,
          expectedVersion: boardVersionRef.current ?? undefined,
        };

        try {
          const firstResponse = await fetch(
            withBasePath(`/api/club/floor?boardId=${FLOOR_BOARD_ID}`),
            {
              method: 'PUT',
              headers: {
                'content-type': 'application/json',
              },
              body: JSON.stringify(requestBody),
            }
          );

          if (firstResponse.ok) {
            const payloadRaw: unknown = await firstResponse.json().catch(() => null);
            if (isFloorBoardResponse(payloadRaw)) {
              boardVersionRef.current = payloadRaw.version;
            } else if (boardVersionRef.current !== null) {
              boardVersionRef.current += 1;
            }

            lastBoardSignatureRef.current = signature;
            return;
          }

          if (firstResponse.status !== 409) {
            return;
          }

          const conflictPayloadRaw: unknown = await firstResponse
            .json()
            .catch(() => null);
          if (!isFloorBoardConflictResponse(conflictPayloadRaw)) {
            return;
          }

          if (typeof conflictPayloadRaw.currentVersion === 'number') {
            boardVersionRef.current = conflictPayloadRaw.currentVersion;
          } else {
            return;
          }

          const secondResponse = await fetch(
            withBasePath(`/api/club/floor?boardId=${FLOOR_BOARD_ID}`),
            {
              method: 'PUT',
              headers: {
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                ...requestBody,
                expectedVersion: boardVersionRef.current,
              }),
            }
          );

          if (!secondResponse.ok) {
            return;
          }

          const secondPayloadRaw: unknown = await secondResponse.json().catch(() => null);
          if (isFloorBoardResponse(secondPayloadRaw)) {
            boardVersionRef.current = secondPayloadRaw.version;
          } else if (boardVersionRef.current !== null) {
            boardVersionRef.current += 1;
          }

          lastBoardSignatureRef.current = signature;
        } catch {
          // Keep UI responsive even if board sync fails.
        }
      };

      void syncBoard();
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
      for (const timer of vsFightTimersRef.current) {
        window.clearTimeout(timer);
      }
      vsFightTimersRef.current = [];
      clearDeleteHoldTimer();
      clearDeleteAnimationTimers();
      resetProximityVsCandidate();
    };
  }, [clearDeleteAnimationTimers, clearDeleteHoldTimer, resetProximityVsCandidate]);

  useEffect(() => {
    floorMoviesRef.current = floorMovies;
  }, [floorMovies]);

  useEffect(() => {
    const visibleMovieIds = new Set(
      floorMovies
        .filter((movie) => !isWaitingSlotCover(movie.coverImage))
        .map((movie) => movie.id)
    );

    setProximityVsPairs((current) =>
      current.filter(
        (pair) =>
          visibleMovieIds.has(pair.firstId) && visibleMovieIds.has(pair.secondId)
      )
    );
    setVsFightByKey((current) => {
      const nextEntries = Object.entries(current).filter(([, fight]) => {
        return (
          visibleMovieIds.has(fight.pair.firstId) &&
          visibleMovieIds.has(fight.pair.secondId)
        );
      });
      if (nextEntries.length === Object.keys(current).length) {
        return current;
      }

      return Object.fromEntries(nextEntries);
    });
  }, [floorMovies]);

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
    resolvingVsPairByKeyRef.current = resolvingVsPairByKey;
  }, [resolvingVsPairByKey]);

  useEffect(() => {
    vsFightByKeyRef.current = vsFightByKey;
  }, [vsFightByKey]);

  useEffect(() => {
    proximityVsPairsRef.current = proximityVsPairs;
  }, [proximityVsPairs]);

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
      const sourceUrl = getSearchMovieSourceImage(movie);
      if (!sourceUrl) {
        return null;
      }

      const previewStep = getSearchPreviewStep(tier);

      const response = await fetch(withBasePath('/api/vhs/render'), {
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

    const response = await fetch(withBasePath(`/api/vhs/covers?${params.toString()}`));
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
    const selectedSourceCover = getSearchMovieSourceImage(selectedMovie);
    const throwCoverImage =
      selectedPreviewCover ??
      activeSearchCover ??
      selectedSourceCover ??
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

      for (const tier of tiersToFetch) {
        if (cancelled || controller.signal.aborted) {
          break;
        }
        await requestPreview(tier);
      }
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
  const selectedSearchSourceCover = selectedSearchMovie
    ? getSearchMovieSourceImage(selectedSearchMovie)
    : null;
  const addSlotCoverImage =
    selectedSearchPreviewCover ??
    activeSearchCover ??
    selectedSearchSourceCover ??
    WAITING_SLOT_IMAGE;
  const addSlotHasCoverImage = Boolean(addSlotCoverImage);
  const draggingMovie =
    draggingId !== null
      ? floorMovies.find((movie) => movie.id === draggingId) ?? null
      : null;
  const draggingScore = draggingMovie
    ? clamp(
        typeof draggingMovie.score === 'number'
          ? draggingMovie.score
          : getTopScorePercent(draggingMovie.y, getFloorBounds().height),
        0,
        100
      )
    : 50;
  const dragScoreDelta = (draggingScore - 50) / 50;
  const dragScoreMagnitude = Math.pow(Math.abs(dragScoreDelta), 0.55);
  const dragLightBoost = dragScoreDelta > 0 ? dragScoreMagnitude : 0;
  const dragDarkBoost = dragScoreDelta < 0 ? dragScoreMagnitude : 0;
  const visibleFloorMovies = floorMovies.filter(
    (movie) => !isWaitingSlotCover(movie.coverImage)
  );
  const topScoreTiePair = (() => {
    if (visibleFloorMovies.length < 2) {
      return null;
    }

    const sorted = [...visibleFloorMovies].sort(
      (a, b) => b.score - a.score || a.rank - b.rank || a.id - b.id
    );
    const first = sorted[0];
    const second = sorted[1];

    if (!first || !second) {
      return null;
    }

    if (first.score < TOP_SCORE_TIE_MIN || second.score < TOP_SCORE_TIE_MIN) {
      return null;
    }

    if (Math.abs(first.score - second.score) > 0.05) {
      return null;
    }

    return {
      first,
      second,
    };
  })();
  const visibleMovieById = new Map(visibleFloorMovies.map((movie) => [movie.id, movie]));
  const activeVsPairs = (() => {
    const nextPairs = [...proximityVsPairs];
    if (topScoreTiePair) {
      const tiePair = createVsPair(topScoreTiePair.first.id, topScoreTiePair.second.id);
      if (!hasVsPair(nextPairs, tiePair)) {
        nextPairs.push(tiePair);
      }
    }

    return nextPairs.filter(
      (pair) => visibleMovieById.has(pair.firstId) && visibleMovieById.has(pair.secondId)
    );
  })();
  const vsBadges = activeVsPairs
    .map((pair) => {
      const first = visibleMovieById.get(pair.firstId);
      const second = visibleMovieById.get(pair.secondId);
      if (!first || !second) {
        return null;
      }

      const center = {
        x: (first.x + CARD_WIDTH * 0.5 + second.x + CARD_WIDTH * 0.5) / 2,
        y: (first.y + CARD_HEIGHT * 0.5 + second.y + CARD_HEIGHT * 0.5) / 2,
      };
      const key = getVsPairKey(pair);
      const fight = vsFightByKey[key] ?? null;

      return {
        key,
        pair,
        first,
        second,
        center,
        resolving: Boolean(resolvingVsPairByKey[key]),
        fight,
      };
    })
    .filter((badge): badge is NonNullable<typeof badge> => Boolean(badge));
  const movieFightEffects = (() => {
    const effectsByMovieId = new Map<
      number,
      {
        x: number;
        y: number;
        rotate: number;
        scale: number;
      }
    >();
    const addEffect = (
      movieId: number,
      partial: { x?: number; y?: number; rotate?: number; scaleMul?: number }
    ) => {
      const current = effectsByMovieId.get(movieId) ?? {
        x: 0,
        y: 0,
        rotate: 0,
        scale: 1,
      };
      effectsByMovieId.set(movieId, {
        x: current.x + (partial.x ?? 0),
        y: current.y + (partial.y ?? 0),
        rotate: current.rotate + (partial.rotate ?? 0),
        scale: current.scale * (partial.scaleMul ?? 1),
      });
    };

    for (const fight of Object.values(vsFightByKey)) {
      const first = visibleMovieById.get(fight.pair.firstId);
      const second = visibleMovieById.get(fight.pair.secondId);
      if (!first || !second) {
        continue;
      }

      if (!fight.winnerId || !fight.loserId) {
        if (fight.stage === 'countdown') {
          const chargeScale = 1 + (4 - fight.countdown) * 0.01;
          addEffect(first.id, { scaleMul: chargeScale });
          addEffect(second.id, { scaleMul: chargeScale });
        }
        continue;
      }

      const winner = visibleMovieById.get(fight.winnerId);
      const loser = visibleMovieById.get(fight.loserId);
      if (!winner || !loser) {
        continue;
      }

      const winnerCenterX = winner.x + CARD_WIDTH * 0.5;
      const winnerCenterY = winner.y + CARD_HEIGHT * 0.5;
      const loserCenterX = loser.x + CARD_WIDTH * 0.5;
      const loserCenterY = loser.y + CARD_HEIGHT * 0.5;
      const distance = Math.hypot(
        loserCenterX - winnerCenterX,
        loserCenterY - winnerCenterY
      );
      const unitX = distance > 0.001 ? (loserCenterX - winnerCenterX) / distance : 0;
      const unitY = distance > 0.001 ? (loserCenterY - winnerCenterY) / distance : 1;

      if (fight.stage === 'lunge') {
        addEffect(winner.id, {
          x: unitX * 56,
          y: unitY * 56,
          rotate: unitX * 2.2,
          scaleMul: 1.02,
        });
        addEffect(loser.id, {
          x: -unitX * 10,
          y: -unitY * 10,
          rotate: -unitX * 1.3,
        });
      } else if (fight.stage === 'impact') {
        addEffect(winner.id, {
          x: -unitX * 10,
          y: -unitY * 8,
          rotate: -unitX * 3.2,
        });
        addEffect(loser.id, {
          x: unitX * 134,
          y: unitY * 108 + 34,
          rotate: unitX >= 0 ? 18 : -18,
          scaleMul: 0.97,
        });
      } else if (fight.stage === 'ko') {
        addEffect(winner.id, {
          x: -unitX * 6,
          y: -unitY * 6,
          rotate: -unitX * 1.8,
          scaleMul: 1.04,
        });
        addEffect(loser.id, {
          x: unitX * 142,
          y: unitY * 118 + 44,
          rotate: unitX >= 0 ? 24 : -24,
          scaleMul: 0.94,
        });
      }
    }

    return effectsByMovieId;
  })();
  const activeCharge = (() => {
    if (!proximityVsCharge) {
      return null;
    }

    const first = visibleMovieById.get(proximityVsCharge.pair.firstId);
    const second = visibleMovieById.get(proximityVsCharge.pair.secondId);
    if (!first || !second) {
      return null;
    }

    const center = {
      x: (first.x + CARD_WIDTH * 0.5 + second.x + CARD_WIDTH * 0.5) / 2,
      y: (first.y + CARD_HEIGHT * 0.5 + second.y + CARD_HEIGHT * 0.5) / 2,
    };

    return {
      ...proximityVsCharge,
      center,
    };
  })();
  const activeChargeProgress = clamp(activeCharge?.progress ?? 0, 0, 1);
  const activeChargeSize = 56 + activeChargeProgress * 72;
  const activeChargeOpacity = 0.2 + activeChargeProgress * 0.55;
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
      window.location.href = withBasePath('/');
    };

    if (signature === lastBoardSignatureRef.current) {
      navigateToTv();
      return;
    }

    void fetch(withBasePath(`/api/club/floor?boardId=${FLOOR_BOARD_ID}`), {
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

  const handleResolveVsPair = useCallback(
    (pair: VsPair) => {
      const pairKey = getVsPairKey(pair);
      if (
        resolvingVsPairByKeyRef.current[pairKey] ||
        Boolean(vsFightByKeyRef.current[pairKey])
      ) {
        return;
      }

      setResolvingVsPairByKey((current) => ({
        ...current,
        [pairKey]: true,
      }));
      setVsFightByKey((current) => ({
        ...current,
        [pairKey]: {
          pair,
          stage: 'countdown',
          countdown: 3,
          winnerId: null,
          loserId: null,
        },
      }));

      const contenderAId = pair.firstId;
      const contenderBId = pair.secondId;
      const clearPairState = () => {
        setVsFightByKey((current) => {
          if (!current[pairKey]) {
            return current;
          }

          const next = { ...current };
          delete next[pairKey];
          return next;
        });
        setResolvingVsPairByKey((current) => {
          if (!current[pairKey]) {
            return current;
          }

          const next = { ...current };
          delete next[pairKey];
          return next;
        });
      };
      const fetchResultPromise: Promise<{ winnerId: number; loserId: number } | null> =
        (async () => {
          try {
            const response = await fetch(withBasePath('/api/club/vs'), {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                movieAId: contenderAId,
                movieBId: contenderBId,
              }),
            });

            if (!response.ok) {
              return null;
            }

            const payloadRaw: unknown = await response.json().catch(() => null);
            if (!payloadRaw || typeof payloadRaw !== 'object') {
              return null;
            }

            const payload = payloadRaw as {
              winnerId?: unknown;
              loserId?: unknown;
            };
            if (
              typeof payload.winnerId !== 'number' ||
              typeof payload.loserId !== 'number'
            ) {
              return null;
            }

            return {
              winnerId: payload.winnerId,
              loserId: payload.loserId,
            };
          } catch {
            return null;
          }
        })();
      const scheduleFightStep = (delayMs: number, action: () => void) => {
        const timer = window.setTimeout(() => {
          vsFightTimersRef.current = vsFightTimersRef.current.filter(
            (activeTimer) => activeTimer !== timer
          );
          action();
        }, delayMs);
        vsFightTimersRef.current.push(timer);
      };
      scheduleFightStep(450, () => {
        setVsFightByKey((current) => {
          const fight = current[pairKey];
          if (!fight) {
            return current;
          }

          return {
            ...current,
            [pairKey]: {
              ...fight,
              countdown: 2,
            },
          };
        });
      });
      scheduleFightStep(900, () => {
        setVsFightByKey((current) => {
          const fight = current[pairKey];
          if (!fight) {
            return current;
          }

          return {
            ...current,
            [pairKey]: {
              ...fight,
              countdown: 1,
            },
          };
        });
      });
      scheduleFightStep(1350, () => {
        setVsFightByKey((current) => {
          const fight = current[pairKey];
          if (!fight) {
            return current;
          }

          return {
            ...current,
            [pairKey]: {
              ...fight,
              countdown: 0,
            },
          };
        });
      });
      scheduleFightStep(1560, () => {
        void (async () => {
          const result = await fetchResultPromise;
          if (!result) {
            clearPairState();
            return;
          }

          setVsFightByKey((current) => {
            const fight = current[pairKey];
            if (!fight) {
              return current;
            }

            return {
              ...current,
              [pairKey]: {
                ...fight,
                stage: 'lunge',
                winnerId: result.winnerId,
                loserId: result.loserId,
              },
            };
          });
        })();
      });
      scheduleFightStep(1830, () => {
        setVsFightByKey((current) => {
          const fight = current[pairKey];
          if (!fight || !fight.winnerId || !fight.loserId) {
            return current;
          }

          return {
            ...current,
            [pairKey]: {
              ...fight,
              stage: 'impact',
            },
          };
        });
      });
      scheduleFightStep(2140, () => {
        setVsFightByKey((current) => {
          const fight = current[pairKey];
          if (!fight || !fight.winnerId || !fight.loserId) {
            return current;
          }

          return {
            ...current,
            [pairKey]: {
              ...fight,
              stage: 'ko',
            },
          };
        });
      });
      scheduleFightStep(2920, () => {
        void (async () => {
          const result = await fetchResultPromise;
          if (!result) {
            clearPairState();
            return;
          }

          const winnerId = result.winnerId;
          const loserId = result.loserId;
          setProximityVsPairs((current) =>
            current.filter((activePair) => !isSameVsPair(activePair, pair))
          );

          const bounds = getFloorBounds();
          const maxTop = Math.max(0, bounds.height - CARD_HEIGHT);
          const maxLeft = Math.max(0, bounds.width - CARD_WIDTH);

          setFloorMovies((previous) => {
            const winnerMovie = previous.find((movie) => movie.id === winnerId);
            const loserMovie = previous.find((movie) => movie.id === loserId);

            if (!winnerMovie || !loserMovie) {
              return previous;
            }

            const winnerCenterX = winnerMovie.x + CARD_WIDTH * 0.5;
            const winnerCenterY = winnerMovie.y + CARD_HEIGHT * 0.5;
            const loserCenterX = loserMovie.x + CARD_WIDTH * 0.5;
            const loserCenterY = loserMovie.y + CARD_HEIGHT * 0.5;
            const distance = Math.hypot(
              loserCenterX - winnerCenterX,
              loserCenterY - winnerCenterY
            );
            const unitX = distance > 0.001 ? (loserCenterX - winnerCenterX) / distance : 0;
            const winnerY = clamp(Math.min(winnerMovie.y, loserMovie.y) - 8, 0, maxTop);
            const loserY = clamp(winnerY + 172, 0, maxTop);
            const winnerX = clamp(winnerMovie.x - unitX * 10, 0, maxLeft);
            const loserX = clamp(loserMovie.x + unitX * 86, 0, maxLeft);

            return recalculateHierarchy(
              previous.map((movie) =>
                movie.id === winnerId
                  ? { ...movie, x: winnerX, y: winnerY }
                  : movie.id === loserId
                    ? { ...movie, x: loserX, y: loserY }
                    : movie
              ),
              bounds.height
            );
          });

          clearPairState();
        })();
      });

    },
    [getFloorBounds]
  );

  return (
    <main className="h-screen w-full overflow-hidden bg-white">
      <div
        ref={floorRef}
        className="relative h-full w-full bg-cover bg-center"
        style={{ backgroundImage: `url('${FLOOR_BACKGROUND_IMAGE}')` }}
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
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            zIndex: 4,
            opacity:
              0.32 +
              (draggingMovie
                ? clamp(0.12 + dragLightBoost * 0.25 - dragDarkBoost * 0.02, 0, 0.35)
                : 0),
            transition: 'opacity 180ms ease-out',
            mixBlendMode: 'soft-light',
            background: `linear-gradient(to bottom, rgba(255,238,190,${
              0.15 + (draggingMovie ? dragLightBoost * 0.3 : 0)
            }) 0%, rgba(255,232,168,${
              0.075 + (draggingMovie ? dragLightBoost * 0.18 : 0)
            }) 40%, rgba(22,14,8,${
              0.045 + (draggingMovie ? dragDarkBoost * 0.12 : 0)
            }) 74%, rgba(14,10,7,${
              0.12 + (draggingMovie ? dragDarkBoost * 0.45 : 0)
            }) 100%)`,
          }}
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            zIndex: 4,
            opacity:
              0.36 +
              (draggingMovie
                ? clamp(0.16 + dragLightBoost * 0.28 - dragDarkBoost * 0.03, 0, 0.44)
                : 0),
            transition: 'opacity 180ms ease-out',
            mixBlendMode: 'screen',
            background: `radial-gradient(68% 52% at 50% -10%, rgba(255,236,168,${
              0.52 + (draggingMovie ? dragLightBoost * 0.65 : 0)
            }) 0%, rgba(255,228,146,${
              0.18 + (draggingMovie ? dragLightBoost * 0.38 : 0)
            }) 42%, rgba(255,223,138,0) 84%)`,
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
        {activeCharge ? (
          <div
            className="pointer-events-none absolute z-[1235]"
            style={{
              width: activeChargeSize,
              height: activeChargeSize,
              left: activeCharge.center.x - activeChargeSize / 2,
              top: activeCharge.center.y - activeChargeSize / 2,
              opacity: activeChargeOpacity,
              transition: 'opacity 70ms linear',
            }}
          >
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  'radial-gradient(circle, rgba(255,248,208,0.92) 0%, rgba(255,224,156,0.56) 40%, rgba(255,184,94,0.14) 72%, rgba(255,168,84,0) 100%)',
                boxShadow:
                  '0 0 28px rgba(255,220,140,0.52), 0 0 56px rgba(255,190,110,0.25)',
              }}
            />
          </div>
        ) : null}
        {vsBadges.map((badge, index) => (
          <button
            key={badge.key}
            type="button"
            onClick={() => handleResolveVsPair(badge.pair)}
            disabled={badge.resolving || Boolean(badge.fight)}
            className="absolute appearance-none border-0 bg-transparent p-0 transition-transform duration-150 hover:scale-105 disabled:cursor-wait"
            style={{
              zIndex: 1250 + index,
              width: VS_BADGE_WIDTH,
              height: VS_BADGE_HEIGHT,
              left: badge.center.x - VS_BADGE_WIDTH / 2,
              top: badge.center.y - VS_BADGE_HEIGHT / 2,
              opacity: badge.resolving ? 0.72 : badge.fight ? 0.84 : 0.94,
              transform: badge.fight
                ? 'scale(1.06)'
                : undefined,
            }}
            aria-label={`Avgjør ${badge.first.title} mot ${badge.second.title}`}
          >
            <img
              src={VS_BADGE_IMAGE}
              alt="VS"
              className={`h-full w-full object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.44)] ${
                badge.fight ? 'vs-badge-fight-active' : ''
              }`}
              draggable={false}
            />
          </button>
        ))}
        {vsBadges.map((badge, index) => {
          const fight = badge.fight;
          if (!fight) {
            return null;
          }

          const isKoLabel = fight.stage === 'ko';
          const isFightLabel = fight.countdown === 0 && !isKoLabel;
          const label = isKoLabel
            ? 'K.O'
            : fight.countdown === 0
              ? 'FIGHT!'
              : String(fight.countdown);
          const countdownClass = isKoLabel
            ? 'vs-showdown-label-ko'
            : isFightLabel
              ? 'vs-showdown-label-fight'
              : 'vs-showdown-label-count';
          const raysClass = isKoLabel
            ? 'vs-showdown-rays-ko'
            : isFightLabel
              ? 'vs-showdown-rays-fight'
              : 'vs-showdown-rays-count';
          const ringClass = isKoLabel
            ? 'vs-showdown-ring-ko'
            : isFightLabel
              ? 'vs-showdown-ring-fight'
              : 'vs-showdown-ring-count';
          return (
            <div
              key={`${badge.key}-countdown-${fight.stage}-${fight.countdown}`}
              className="pointer-events-none absolute"
              style={{
                zIndex: 1270 + index,
                left: badge.center.x,
                top: badge.center.y - VS_BADGE_HEIGHT * 0.78,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <div className={`vs-showdown-ring ${ringClass}`} />
              <div className={`vs-showdown-rays ${raysClass}`} />
              <div className={`vs-showdown-label ${countdownClass}`}>
                {label}
              </div>
            </div>
          );
        })}
        {visibleFloorMovies.map((movie) => {
          const dragging = draggingId === movie.id;
          const deleteCandidate = dragging && deleteCandidateId === movie.id;
          const deleteArmed = dragging && deleteArmedId === movie.id;
          const chargePair = activeCharge?.pair ?? null;
          const isChargingMovie =
            chargePair !== null &&
            (movie.id === chargePair.firstId || movie.id === chargePair.secondId);
          let chargeOffsetX = 0;
          let chargeOffsetY = 0;

          if (isChargingMovie && activeCharge) {
            const movieCenterX = movie.x + CARD_WIDTH * 0.5;
            const movieCenterY = movie.y + CARD_HEIGHT * 0.5;
            const deltaX = activeCharge.center.x - movieCenterX;
            const deltaY = activeCharge.center.y - movieCenterY;
            const distance = Math.hypot(deltaX, deltaY);

            if (distance > 0.001) {
              const pullStrength =
                PROXIMITY_VS_PULL_MAX *
                (0.18 + Math.pow(activeChargeProgress, 1.2) * 0.82);
              chargeOffsetX = (deltaX / distance) * pullStrength;
              chargeOffsetY = (deltaY / distance) * pullStrength;
            }
          }
          const fightEffect = movieFightEffects.get(movie.id);
          const fightOffsetX = fightEffect?.x ?? 0;
          const fightOffsetY = fightEffect?.y ?? 0;
          const fightRotate = fightEffect?.rotate ?? 0;
          const fightScale = fightEffect?.scale ?? 1;
          const totalOffsetX = chargeOffsetX + fightOffsetX;
          const totalOffsetY = chargeOffsetY + fightOffsetY;
          const isFightAnimated = Boolean(fightEffect);

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
                transform: `translate(${totalOffsetX}px, ${totalOffsetY}px) rotate(${movie.rotation + fightRotate}deg) scale(${fightScale})`,
                transition:
                  isChargingMovie || isFightAnimated
                    ? 'transform 140ms cubic-bezier(0.24, 0.8, 0.24, 1)'
                    : undefined,
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
                      src={VHS_FRONT_SIDE_IMAGE}
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
        <style jsx global>{`
          @font-face {
            font-family: 'TarrgetCountdown';
            src: url('${withBasePath('/fonts/tarrget/tarrget.ttf')}') format('truetype');
            font-style: normal;
            font-weight: 400;
            font-display: swap;
          }

          @font-face {
            font-family: 'TarrgetChrome';
            src: url('${withBasePath('/fonts/tarrget/tarrgetchrome.ttf')}')
              format('truetype');
            font-style: normal;
            font-weight: 400;
            font-display: swap;
          }

          @keyframes vs-badge-flare {
            0% {
              transform: scale(1) rotate(-1deg);
              filter: drop-shadow(0 8px 14px rgba(0, 0, 0, 0.46))
                drop-shadow(0 0 0 rgba(255, 191, 76, 0));
            }
            48% {
              transform: scale(1.07) rotate(1.2deg);
              filter: drop-shadow(0 12px 18px rgba(0, 0, 0, 0.54))
                drop-shadow(0 0 20px rgba(255, 198, 95, 0.66));
            }
            100% {
              transform: scale(1) rotate(-1deg);
              filter: drop-shadow(0 8px 14px rgba(0, 0, 0, 0.46))
                drop-shadow(0 0 2px rgba(255, 191, 76, 0.2));
            }
          }

          @keyframes vs-showdown-ring-pulse {
            0% {
              transform: translate(-50%, -50%) scale(0.72);
              opacity: 0;
            }
            35% {
              opacity: 0.95;
            }
            100% {
              transform: translate(-50%, -50%) scale(1.2);
              opacity: 0;
            }
          }

          @keyframes vs-showdown-rays-spin {
            0% {
              transform: translate(-50%, -50%) rotate(0deg) scale(0.9);
              opacity: 0.2;
            }
            42% {
              opacity: 0.88;
            }
            100% {
              transform: translate(-50%, -50%) rotate(28deg) scale(1.08);
              opacity: 0.16;
            }
          }

          @keyframes vs-showdown-count-pop {
            0% {
              transform: translate(-50%, -50%) scale(0.68);
              opacity: 0;
            }
            36% {
              transform: translate(-50%, -50%) scale(1.08);
              opacity: 1;
            }
            100% {
              transform: translate(-50%, -50%) scale(0.98);
              opacity: 0.96;
            }
          }

          @keyframes vs-showdown-fight-slam {
            0% {
              transform: translate(-50%, -50%) scale(0.52) rotate(-4deg);
              opacity: 0;
            }
            34% {
              transform: translate(-50%, -50%) scale(1.2) rotate(2.2deg);
              opacity: 1;
            }
            62% {
              transform: translate(-50%, -50%) scale(0.96) rotate(-1deg);
              opacity: 1;
            }
            100% {
              transform: translate(-50%, -50%) scale(1.02) rotate(0deg);
              opacity: 0.98;
            }
          }

          @keyframes vs-showdown-ko-crash {
            0% {
              transform: translate(-50%, -50%) scale(0.34) rotate(-7deg);
              opacity: 0;
            }
            40% {
              transform: translate(-50%, -50%) scale(1.24) rotate(1.5deg);
              opacity: 1;
            }
            76% {
              transform: translate(-50%, -50%) scale(0.94) rotate(-1.2deg);
              opacity: 0.98;
            }
            100% {
              transform: translate(-50%, -50%) scale(1.02) rotate(0deg);
              opacity: 1;
            }
          }

          .vs-badge-fight-active {
            animation: vs-badge-flare 520ms ease-in-out infinite;
            transform-origin: center;
          }

          .vs-showdown-ring,
          .vs-showdown-rays,
          .vs-showdown-label {
            position: absolute;
            left: 50%;
            top: 50%;
            pointer-events: none;
          }

          .vs-showdown-ring {
            width: 210px;
            height: 210px;
            border-radius: 9999px;
            animation: vs-showdown-ring-pulse 430ms ease-out 1 both;
          }

          .vs-showdown-ring-count {
            background: radial-gradient(
              circle,
              rgba(255, 245, 208, 0.28) 0%,
              rgba(255, 214, 106, 0.2) 38%,
              rgba(255, 152, 58, 0.08) 58%,
              rgba(255, 132, 48, 0) 72%
            );
            box-shadow:
              0 0 28px rgba(255, 210, 112, 0.42),
              0 0 84px rgba(255, 150, 52, 0.25);
          }

          .vs-showdown-ring-fight {
            background: radial-gradient(
              circle,
              rgba(255, 242, 224, 0.28) 0%,
              rgba(255, 142, 84, 0.24) 34%,
              rgba(255, 68, 32, 0.12) 58%,
              rgba(255, 44, 18, 0) 74%
            );
            box-shadow:
              0 0 36px rgba(255, 160, 84, 0.56),
              0 0 102px rgba(255, 72, 32, 0.34);
          }

          .vs-showdown-ring-ko {
            background: radial-gradient(
              circle,
              rgba(255, 248, 220, 0.34) 0%,
              rgba(255, 112, 64, 0.3) 32%,
              rgba(255, 48, 20, 0.14) 56%,
              rgba(255, 48, 20, 0) 74%
            );
            box-shadow:
              0 0 40px rgba(255, 176, 92, 0.66),
              0 0 126px rgba(255, 56, 24, 0.44);
          }

          .vs-showdown-rays {
            width: 280px;
            height: 280px;
            border-radius: 9999px;
            animation: vs-showdown-rays-spin 430ms linear 1 both;
            mix-blend-mode: screen;
          }

          .vs-showdown-rays-count {
            background: conic-gradient(
              from 0deg,
              rgba(255, 239, 191, 0) 0deg,
              rgba(255, 214, 120, 0.58) 20deg,
              rgba(255, 152, 58, 0) 54deg,
              rgba(255, 214, 120, 0.54) 84deg,
              rgba(255, 152, 58, 0) 124deg,
              rgba(255, 214, 120, 0.52) 164deg,
              rgba(255, 152, 58, 0) 212deg,
              rgba(255, 214, 120, 0.52) 246deg,
              rgba(255, 152, 58, 0) 294deg,
              rgba(255, 214, 120, 0.56) 330deg,
              rgba(255, 239, 191, 0) 360deg
            );
            opacity: 0.68;
          }

          .vs-showdown-rays-fight {
            background: conic-gradient(
              from 0deg,
              rgba(255, 226, 192, 0) 0deg,
              rgba(255, 174, 92, 0.78) 18deg,
              rgba(255, 82, 44, 0) 56deg,
              rgba(255, 174, 92, 0.74) 88deg,
              rgba(255, 82, 44, 0) 132deg,
              rgba(255, 174, 92, 0.7) 170deg,
              rgba(255, 82, 44, 0) 222deg,
              rgba(255, 174, 92, 0.74) 258deg,
              rgba(255, 82, 44, 0) 306deg,
              rgba(255, 174, 92, 0.74) 338deg,
              rgba(255, 226, 192, 0) 360deg
            );
            opacity: 0.9;
          }

          .vs-showdown-rays-ko {
            background: conic-gradient(
              from 0deg,
              rgba(255, 236, 196, 0) 0deg,
              rgba(255, 205, 118, 0.92) 16deg,
              rgba(255, 72, 34, 0) 52deg,
              rgba(255, 205, 118, 0.88) 84deg,
              rgba(255, 72, 34, 0) 126deg,
              rgba(255, 205, 118, 0.84) 164deg,
              rgba(255, 72, 34, 0) 216deg,
              rgba(255, 205, 118, 0.86) 252deg,
              rgba(255, 72, 34, 0) 304deg,
              rgba(255, 205, 118, 0.9) 336deg,
              rgba(255, 236, 196, 0) 360deg
            );
            opacity: 0.96;
          }

          .vs-showdown-label {
            white-space: nowrap;
            font-family: 'TarrgetCountdown', 'Impact', 'Arial Black', sans-serif;
            font-weight: 400;
            line-height: 1;
            letter-spacing: 0.02em;
            text-transform: uppercase;
            transform-origin: center;
          }

          .vs-showdown-label-count {
            font-size: 64px;
            color: #fff6dc;
            -webkit-text-stroke: 2.8px #300b05;
            text-shadow:
              0 0 14px rgba(255, 216, 112, 0.92),
              0 0 34px rgba(255, 150, 56, 0.72),
              0 10px 0 rgba(66, 8, 4, 0.98),
              0 22px 26px rgba(0, 0, 0, 0.58);
            animation: vs-showdown-count-pop
              430ms
              cubic-bezier(0.2, 0.88, 0.2, 1)
              1
              both;
          }

          .vs-showdown-label-fight {
            font-size: 66px;
            font-family: 'TarrgetChrome', 'TarrgetCountdown', 'Impact', 'Arial Black',
              sans-serif;
            background: linear-gradient(
              to bottom,
              #fff8ea 0%,
              #f5f5f5 38%,
              #c9ced5 52%,
              #f4f4f4 72%,
              #9ca4ad 100%
            );
            -webkit-background-clip: text;
            background-clip: text;
            -webkit-text-fill-color: transparent;
            -webkit-text-stroke: 3.1px #2b0602;
            text-shadow:
              0 0 20px rgba(255, 222, 130, 0.98),
              0 0 44px rgba(255, 100, 44, 0.9),
              0 12px 0 rgba(70, 4, 2, 0.98),
              0 24px 30px rgba(0, 0, 0, 0.66);
            animation: vs-showdown-fight-slam
              360ms
              cubic-bezier(0.12, 0.92, 0.2, 1.08)
              1
              both;
          }

          .vs-showdown-label-ko {
            font-size: 72px;
            font-family: 'TarrgetChrome', 'TarrgetCountdown', 'Impact', 'Arial Black',
              sans-serif;
            background: linear-gradient(
              to bottom,
              #fffdf7 0%,
              #ffffff 22%,
              #f1f4f8 42%,
              #a5b0bc 58%,
              #f2f2f2 76%,
              #8f9aa5 100%
            );
            -webkit-background-clip: text;
            background-clip: text;
            -webkit-text-fill-color: transparent;
            -webkit-text-stroke: 3.3px #260401;
            text-shadow:
              0 0 18px rgba(255, 230, 148, 0.95),
              0 0 46px rgba(255, 86, 38, 0.96),
              0 13px 0 rgba(66, 5, 2, 0.98),
              0 28px 34px rgba(0, 0, 0, 0.72);
            animation: vs-showdown-ko-crash
              600ms
              cubic-bezier(0.12, 0.96, 0.2, 1.08)
              1
              both;
          }
        `}</style>
      </div>
    </main>
  );
};

export default FloorPage;
