import { type NextPage } from 'next';
import { useEffect, useRef, useState } from 'react';
import {
  ACCESS_CODE_LENGTH,
  resolveClubSlugFromAccessCode,
} from '@/lib/accessCodes';
import { withBasePath } from '@/lib/basePath';
import {
  DEFAULT_CLUB_SLUG,
  getBoardIdFromClubSlug,
  getClubHomePath,
  getClubFloorPath,
  normalizeClubSlug,
} from '@/lib/clubSlug';

interface ProgramMovie {
  id: number;
  title: string;
  rank: number;
  score: number;
  coverImage: string;
  scheduledAt: string;
  backdropUrl: string | null;
  posterUrl: string | null;
  releaseDate: string | null;
  year: number | null;
}

interface ProgramResponse {
  boardId: string;
  updatedAt: string;
  generatedAt: string;
  now: ProgramMovie | null;
  queue: ProgramMovie[];
}

const FALLBACK_SCREEN_IMAGE = withBasePath('/VHS/backgrounds/floor-oak.png');
const LANDING_REMOTE_IMAGE = withBasePath('/VHS/ui/remote-control-black-transparent.png');

type AccessStatus = 'idle' | 'typing' | 'invalid' | 'accepted';

type RemoteControlAction =
  | { kind: 'digit'; value: string }
  | { kind: 'ok' }
  | { kind: 'backspace' }
  | { kind: 'reset' };

interface RemoteControlHotspot {
  id: string;
  label: string;
  action: RemoteControlAction;
  left: number;
  top: number;
  width: number;
  height: number;
}

const LANDING_REMOTE_HOTSPOTS: RemoteControlHotspot[] = [
  {
    id: 'digit-1',
    label: 'Tast 1',
    action: { kind: 'digit', value: '1' },
    left: 22.3,
    top: 24.6,
    width: 7.3,
    height: 2.9,
  },
  {
    id: 'digit-2',
    label: 'Tast 2',
    action: { kind: 'digit', value: '2' },
    left: 34.0,
    top: 24.6,
    width: 7.3,
    height: 2.9,
  },
  {
    id: 'digit-3',
    label: 'Tast 3',
    action: { kind: 'digit', value: '3' },
    left: 45.7,
    top: 24.6,
    width: 7.1,
    height: 2.9,
  },
  {
    id: 'backspace',
    label: 'Slett siste siffer',
    action: { kind: 'backspace' },
    left: 20.8,
    top: 58.4,
    width: 6.8,
    height: 3.8,
  },
  {
    id: 'digit-4',
    label: 'Tast 4',
    action: { kind: 'digit', value: '4' },
    left: 21.5,
    top: 31.6,
    width: 7.3,
    height: 2.9,
  },
  {
    id: 'digit-5',
    label: 'Tast 5',
    action: { kind: 'digit', value: '5' },
    left: 33.3,
    top: 31.6,
    width: 7.3,
    height: 2.9,
  },
  {
    id: 'digit-6',
    label: 'Tast 6',
    action: { kind: 'digit', value: '6' },
    left: 45.0,
    top: 31.6,
    width: 7.1,
    height: 2.9,
  },
  {
    id: 'digit-7',
    label: 'Tast 7',
    action: { kind: 'digit', value: '7' },
    left: 20.8,
    top: 38.6,
    width: 7.3,
    height: 2.9,
  },
  {
    id: 'digit-8',
    label: 'Tast 8',
    action: { kind: 'digit', value: '8' },
    left: 32.6,
    top: 38.6,
    width: 7.3,
    height: 2.9,
  },
  {
    id: 'digit-9',
    label: 'Tast 9',
    action: { kind: 'digit', value: '9' },
    left: 44.2,
    top: 38.6,
    width: 7.1,
    height: 2.9,
  },
  {
    id: 'reset',
    label: 'Nullstill kode',
    action: { kind: 'reset' },
    left: 67.0,
    top: 25.4,
    width: 6.8,
    height: 3,
  },
];

interface FilmClubPageProps {
  clubSlug?: string;
}

const isProgramMovie = (value: unknown): value is ProgramMovie => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const entry = value as Partial<ProgramMovie>;
  return (
    typeof entry.id === 'number' &&
    typeof entry.title === 'string' &&
    typeof entry.rank === 'number' &&
    typeof entry.score === 'number' &&
    typeof entry.coverImage === 'string' &&
    typeof entry.scheduledAt === 'string'
  );
};

const isProgramResponse = (value: unknown): value is ProgramResponse => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Partial<ProgramResponse>;
  const nowValid = payload.now === null || isProgramMovie(payload.now);
  return (
    typeof payload.boardId === 'string' &&
    typeof payload.updatedAt === 'string' &&
    typeof payload.generatedAt === 'string' &&
    Array.isArray(payload.queue) &&
    payload.queue.every(isProgramMovie) &&
    nowValid
  );
};

const formatProgramDate = (isoValue: string): string => {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('nb-NO', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export const HomeScreen = ({
  clubSlug = DEFAULT_CLUB_SLUG,
}: FilmClubPageProps) => {
  const normalizedClubSlug = normalizeClubSlug(clubSlug);
  const boardId = getBoardIdFromClubSlug(normalizedClubSlug);
  const floorPath = withBasePath(getClubFloorPath(normalizedClubSlug));
  const [program, setProgram] = useState<ProgramResponse | null>(null);
  const [isPoweringOn, setIsPoweringOn] = useState(true);
  const [isPoweringOff, setIsPoweringOff] = useState(false);
  const powerOffTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: number | null = null;

    const loadProgram = async () => {
      try {
        const params = new URLSearchParams({ boardId });
        const response = await fetch(withBasePath(`/api/club/next?${params.toString()}`));
        if (!response.ok) {
          return;
        }

        const payloadRaw: unknown = await response.json();
        if (!isProgramResponse(payloadRaw)) {
          return;
        }

        if (!cancelled) {
          setProgram(payloadRaw);
        }
      } catch {
        // Keep last rendered TV program if fetch fails.
      } finally {
        if (!cancelled) {
          pollTimer = window.setTimeout(() => {
            void loadProgram();
          }, 15_000);
        }
      }
    };

    void loadProgram();

    return () => {
      cancelled = true;
      if (pollTimer !== null) {
        window.clearTimeout(pollTimer);
      }
    };
  }, [boardId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsPoweringOn(false);
    }, 920);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (powerOffTimerRef.current !== null) {
        window.clearTimeout(powerOffTimerRef.current);
        powerOffTimerRef.current = null;
      }
    };
  }, []);

  const nowMovie = program?.now ?? null;
  const screenImage =
    nowMovie?.backdropUrl ??
    nowMovie?.posterUrl ??
    nowMovie?.coverImage ??
    FALLBACK_SCREEN_IMAGE;

  const handlePowerOff = () => {
    if (isPoweringOff) {
      return;
    }

    setIsPoweringOff(true);
    powerOffTimerRef.current = window.setTimeout(() => {
      window.location.href = floorPath;
    }, 640);
  };

  return (
    <main className="fixed inset-0 flex items-center justify-center overflow-hidden bg-black">
      <div className="relative w-[92vw] max-w-6xl aspect-[16/10] rounded-[2.2rem] bg-black p-4 shadow-2xl">
        <div
          className="relative h-full w-full overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#0b0f13]
          before:pointer-events-none before:absolute before:inset-0 before:z-20
          before:bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.11)_50%)] before:bg-[length:100%_4px] before:content-['']
          after:pointer-events-none after:absolute after:inset-0 after:z-20
          after:bg-[radial-gradient(circle_900px_at_50%_46%,rgba(255,255,255,0.08),transparent_72%)] after:content-['']"
        >
          <div
            className="absolute inset-0"
            style={{
              transformOrigin: '50% 50%',
              animation: isPoweringOff
                ? 'tvPowerOff 640ms cubic-bezier(0.22, 0.9, 0.24, 1) both'
                : isPoweringOn
                  ? 'tvPowerOn 920ms cubic-bezier(0.22, 0.9, 0.24, 1) both'
                  : undefined,
            }}
          >
            <img
              src={screenImage}
              alt={nowMovie?.title ?? 'Neste film'}
              className="absolute inset-0 h-full w-full object-cover"
              draggable={false}
            />
            <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/82 via-black/44 to-black/32" />

            <div className="absolute left-7 right-7 top-6 z-30 text-white">
              <div className="text-[11px] tracking-[0.24em] text-white/70">NESTE PÅ KLUBBEN</div>
              <h1 className="mt-2 text-[clamp(22px,3.4vw,52px)] font-semibold leading-[0.92]">
                {nowMovie?.title ?? 'Ingen film valgt ennå'}
              </h1>
              {nowMovie?.scheduledAt ? (
                <div className="mt-3 text-sm text-white/80">
                  Vises: {formatProgramDate(nowMovie.scheduledAt)}
                </div>
              ) : null}
            </div>
          </div>

          {isPoweringOn ? (
            <div
              className="pointer-events-none absolute inset-0 z-40 bg-white"
              style={{
                animation: 'tvPowerFlash 700ms ease-out forwards',
              }}
            />
          ) : null}
          {isPoweringOff ? (
            <div
              className="pointer-events-none absolute inset-0 z-40"
              style={{
                animation: 'tvPowerOffFlash 640ms ease-in forwards',
                background:
                  'radial-gradient(520px 2px at 50% 50%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.32) 34%, rgba(255,255,255,0) 72%)',
              }}
            />
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Skru av TV"
          onClick={handlePowerOff}
          disabled={isPoweringOff}
          className="absolute bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/35 bg-black/48 p-3 text-white backdrop-blur-sm transition hover:scale-105 hover:bg-black/62"
        >
          <span className="relative block h-4 w-4 rounded-full border-2 border-white/90">
            <span className="absolute left-1/2 top-[-6px] h-2.5 w-[2px] -translate-x-1/2 bg-white" />
          </span>
        </button>
      </div>
    </main>
  );
};

const Home: NextPage = () => {
  const landingBoardId = getBoardIdFromClubSlug(DEFAULT_CLUB_SLUG);
  const [enteredDigits, setEnteredDigits] = useState('');
  const [status, setStatus] = useState<AccessStatus>('idle');
  const [resolvedSlug, setResolvedSlug] = useState<string | null>(null);
  const [pressedControlId, setPressedControlId] = useState<string | null>(null);
  const [isPoweringOn, setIsPoweringOn] = useState(true);
  const [isPoweringOff, setIsPoweringOff] = useState(false);
  const [landingProgram, setLandingProgram] = useState<ProgramResponse | null>(null);
  const invalidResetTimerRef = useRef<number | null>(null);
  const acceptedNavigationTimerRef = useRef<number | null>(null);
  const pressedControlTimerRef = useRef<number | null>(null);
  const appendDigitRef = useRef<(digit: string) => void>(() => undefined);
  const backspaceRef = useRef<() => void>(() => undefined);
  const submitCodeRef = useRef<() => void>(() => undefined);
  const resetEntryRef = useRef<() => void>(() => undefined);
  const autoSubmitRef = useRef<() => void>(() => undefined);

  const resetStatus = () => {
    setEnteredDigits('');
    setStatus('idle');
    setResolvedSlug(null);
    setIsPoweringOff(false);
  };

  const clearTimers = () => {
    if (invalidResetTimerRef.current !== null) {
      window.clearTimeout(invalidResetTimerRef.current);
      invalidResetTimerRef.current = null;
    }
    if (acceptedNavigationTimerRef.current !== null) {
      window.clearTimeout(acceptedNavigationTimerRef.current);
      acceptedNavigationTimerRef.current = null;
    }
    if (pressedControlTimerRef.current !== null) {
      window.clearTimeout(pressedControlTimerRef.current);
      pressedControlTimerRef.current = null;
    }
  };

  const navigateToClub = (clubSlug: string) => {
    const normalizedClubSlug = normalizeClubSlug(clubSlug);
    setResolvedSlug(normalizedClubSlug);
    setStatus('accepted');
    setIsPoweringOff(true);

    if (acceptedNavigationTimerRef.current !== null) {
      window.clearTimeout(acceptedNavigationTimerRef.current);
    }

    acceptedNavigationTimerRef.current = window.setTimeout(() => {
      window.location.href = withBasePath(getClubHomePath(normalizedClubSlug));
    }, 720);
  };

  const resetEntry = () => {
    if (status === 'invalid' || status === 'accepted') {
      clearTimers();
    }
    resetStatus();
  };

  const handleInvalidCode = () => {
    clearTimers();
    setResolvedSlug(null);
    setStatus('invalid');

    invalidResetTimerRef.current = window.setTimeout(() => {
      resetStatus();
    }, 960);
  };

  const appendDigit = (digit: string) => {
    if (status === 'accepted') {
      return;
    }

    if (status === 'invalid') {
      clearTimers();
      resetStatus();
    }

    setEnteredDigits((current) => {
      if (current.length >= ACCESS_CODE_LENGTH) {
        return current;
      }

      const nextDigits = `${current}${digit}`;
      setStatus('typing');
      return nextDigits;
    });
  };

  const handleBackspace = () => {
    if (status === 'accepted') {
      return;
    }

    if (status === 'invalid') {
      clearTimers();
      resetStatus();
      return;
    }

    setEnteredDigits((current) => {
      const nextDigits = current.slice(0, -1);
      setStatus(nextDigits.length > 0 ? 'typing' : 'idle');
      return nextDigits;
    });
  };

  const handleSubmitCode = () => {
    if (status === 'accepted') {
      return;
    }

    if (enteredDigits.length !== ACCESS_CODE_LENGTH) {
      return;
    }

    const clubSlug = resolveClubSlugFromAccessCode(enteredDigits);
    if (!clubSlug) {
      handleInvalidCode();
      return;
    }

    navigateToClub(clubSlug);
  };

  const handleControlAction = (
    action: RemoteControlAction,
    controlId: string
  ) => {
    setPressedControlId(controlId);

    if (pressedControlTimerRef.current !== null) {
      window.clearTimeout(pressedControlTimerRef.current);
    }

    pressedControlTimerRef.current = window.setTimeout(() => {
      setPressedControlId((current) => (current === controlId ? null : current));
      pressedControlTimerRef.current = null;
    }, 180);

    if (action.kind === 'digit') {
      appendDigit(action.value);
      return;
    }

    if (action.kind === 'backspace') {
      handleBackspace();
      return;
    }

    if (action.kind === 'reset') {
      resetEntry();
      return;
    }

    handleSubmitCode();
  };

  appendDigitRef.current = appendDigit;
  backspaceRef.current = handleBackspace;
  submitCodeRef.current = handleSubmitCode;
  resetEntryRef.current = resetEntry;
  autoSubmitRef.current = handleSubmitCode;

  useEffect(() => {
    let cancelled = false;

    const loadLandingProgram = async () => {
      try {
        const params = new URLSearchParams({ boardId: landingBoardId });
        const response = await fetch(withBasePath(`/api/club/next?${params.toString()}`));
        if (!response.ok) {
          return;
        }

        const payloadRaw: unknown = await response.json();
        if (!isProgramResponse(payloadRaw)) {
          return;
        }

        if (!cancelled) {
          setLandingProgram(payloadRaw);
        }
      } catch {
        // Keep fallback visuals if the landing program cannot be loaded.
      }
    };

    void loadLandingProgram();

    return () => {
      cancelled = true;
    };
  }, [landingBoardId]);

  useEffect(() => {
    const powerOnTimer = window.setTimeout(() => {
      setIsPoweringOn(false);
    }, 920);

    return () => {
      window.clearTimeout(powerOnTimer);
    };
  }, []);

  useEffect(() => {
    if (status !== 'typing' || enteredDigits.length !== ACCESS_CODE_LENGTH) {
      return;
    }

    const autoSubmitTimer = window.setTimeout(() => {
      autoSubmitRef.current();
    }, 180);

    return () => {
      window.clearTimeout(autoSubmitTimer);
    };
  }, [enteredDigits, status]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key >= '0' && event.key <= '9') {
        event.preventDefault();
        appendDigitRef.current(event.key);
        return;
      }

      if (event.key === 'Backspace') {
        event.preventDefault();
        backspaceRef.current();
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        submitCodeRef.current();
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        resetEntryRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (invalidResetTimerRef.current !== null) {
        window.clearTimeout(invalidResetTimerRef.current);
      }
      if (acceptedNavigationTimerRef.current !== null) {
        window.clearTimeout(acceptedNavigationTimerRef.current);
      }
      if (pressedControlTimerRef.current !== null) {
        window.clearTimeout(pressedControlTimerRef.current);
      }
    };
  }, []);

  const landingMovie = landingProgram?.now ?? landingProgram?.queue[0] ?? null;
  const landingScreenImage =
    landingMovie?.backdropUrl ??
    landingMovie?.posterUrl ??
    landingMovie?.coverImage ??
    FALLBACK_SCREEN_IMAGE;
  const statusLabel =
    status === 'accepted' ? 'ÅPNER' : status === 'invalid' ? 'FEIL' : '';
  const screenGlow =
    status === 'invalid'
      ? 'radial-gradient(circle at 50% 52%, rgba(255,88,88,0.28) 0%, rgba(162,24,24,0.16) 32%, rgba(0,0,0,0) 72%)'
      : status === 'accepted'
        ? 'radial-gradient(circle at 50% 52%, rgba(255,234,180,0.24) 0%, rgba(255,210,112,0.11) 32%, rgba(0,0,0,0) 72%)'
        : 'radial-gradient(circle at 32% 24%, rgba(255,177,104,0.26) 0%, rgba(255,131,79,0.12) 24%, rgba(0,0,0,0) 48%), radial-gradient(circle at 74% 28%, rgba(98,166,255,0.2) 0%, rgba(33,88,152,0.1) 26%, rgba(0,0,0,0) 50%), radial-gradient(circle at 52% 88%, rgba(255,238,180,0.08) 0%, rgba(0,0,0,0) 42%)';

  return (
    <main className="fixed inset-0 overflow-auto bg-black text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,172,102,0.16),transparent_30%),linear-gradient(180deg,#06070b_0%,#020304_100%)]" />
      <div className="relative mx-auto flex min-h-full w-full max-w-7xl flex-col items-center justify-center px-4 pb-20 pt-8 sm:pb-24">
        <section className="w-full max-w-6xl">
          <div className="relative mx-auto w-full max-w-6xl aspect-[16/10] rounded-[2.2rem] bg-black p-4 shadow-[0_36px_120px_rgba(0,0,0,0.6)]">
            <div
              className="relative h-full w-full overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#090b12]
              before:pointer-events-none before:absolute before:inset-0 before:z-20
              before:bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.11)_50%)] before:bg-[length:100%_4px] before:content-['']
              after:pointer-events-none after:absolute after:inset-0 after:z-20
              after:bg-[radial-gradient(circle_900px_at_50%_46%,rgba(255,255,255,0.08),transparent_72%)] after:content-['']"
            >
              <div
                className="absolute inset-0"
                style={{
                  transformOrigin: '50% 50%',
                  animation: isPoweringOff
                    ? 'tvPowerOff 640ms cubic-bezier(0.22, 0.9, 0.24, 1) both'
                    : isPoweringOn
                      ? 'tvPowerOn 920ms cubic-bezier(0.22, 0.9, 0.24, 1) both'
                      : undefined,
                }}
              >
                <img
                  src={landingScreenImage}
                  alt={landingMovie?.title ?? 'Filmklubb'}
                  className="absolute inset-0 h-full w-full object-cover"
                  draggable={false}
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      `${screenGlow}, linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.42) 36%, rgba(0,0,0,0.74) 100%)`,
                  }}
                />
                <div
                  className="pointer-events-none absolute inset-0 opacity-[0.24]"
                  style={{
                    backgroundImage:
                      'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
                    backgroundSize: '46px 46px',
                    maskImage:
                      'radial-gradient(circle at center, rgba(0,0,0,0.92) 44%, rgba(0,0,0,0.28) 82%, rgba(0,0,0,0) 100%)',
                  }}
                />
                <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/82 via-black/44 to-black/28" />
                {status === 'invalid' ? (
                  <div className="access-code-denied-flash pointer-events-none absolute inset-0 z-20 bg-[radial-gradient(circle_at_center,rgba(255,120,120,0.16)_0%,rgba(255,56,56,0.28)_36%,rgba(0,0,0,0)_76%)]" />
                ) : null}
                {status === 'accepted' ? (
                  <div className="access-code-accepted-flash pointer-events-none absolute inset-0 z-20 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.12)_0%,rgba(255,228,160,0.22)_36%,rgba(0,0,0,0)_76%)]" />
                ) : null}

                <div className="absolute inset-x-0 top-1/2 z-30 -translate-y-1/2 px-7">
                  <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
                    {statusLabel ? (
                      <div className="mb-5 text-[11px] uppercase tracking-[0.42em] text-white/72 sm:mb-6 sm:text-[13px]">
                        {statusLabel}
                      </div>
                    ) : null}
                    <div className="flex items-center justify-center gap-3 sm:gap-5">
                      {Array.from({ length: ACCESS_CODE_LENGTH }, (_, index) => {
                        const digit = enteredDigits[index] ?? null;
                        const isFilled = digit !== null;

                        return (
                          <div
                            key={`pin-slot-${index}`}
                            className={`flex h-20 w-16 items-center justify-center rounded-[1.5rem] border-2 text-[clamp(28px,5vw,56px)] font-semibold shadow-[0_10px_30px_rgba(0,0,0,0.22)] sm:h-24 sm:w-20 md:h-28 md:w-24 ${
                              status === 'invalid'
                                ? 'border-[#ff9b9b]/72 bg-[#3d1010]/44 text-[#fff1f1]'
                                : status === 'accepted'
                                  ? 'border-[#ffe1a3]/72 bg-[#3a2b14]/42 text-[#fff7de]'
                                  : isFilled
                                    ? 'border-white/82 bg-black/18 text-white'
                                    : 'border-white/68 bg-black/14 text-white/28'
                            }`}
                          >
                            {digit ?? '•'}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {isPoweringOn ? (
                <div
                  className="pointer-events-none absolute inset-0 z-40 bg-white"
                  style={{ animation: 'tvPowerFlash 700ms ease-out forwards' }}
                />
              ) : null}
              {isPoweringOff ? (
                <div
                  className="pointer-events-none absolute inset-0 z-40"
                  style={{
                    animation: 'tvPowerOffFlash 640ms ease-in forwards',
                    background:
                      'radial-gradient(520px 2px at 50% 50%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.32) 34%, rgba(255,255,255,0) 72%)',
                  }}
                />
              ) : null}
            </div>
          </div>
        </section>

        <aside className="relative z-20 -mt-3 flex w-full justify-center sm:-mt-5">
          <div className="pointer-events-none absolute bottom-[82%] left-1/2 h-40 w-[30rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,218,164,0.18)_0%,rgba(255,218,164,0.08)_26%,rgba(255,218,164,0)_72%)] blur-2xl sm:h-52 sm:w-[40rem]" />
          <div className="relative w-full max-w-[320px] rotate-[9deg] sm:max-w-[360px] md:max-w-[400px]">
            <div className="absolute inset-x-[20%] top-[-8%] h-[16%] rounded-full bg-black/30 blur-2xl" />
            <div className="relative mx-auto aspect-[433/612] w-full overflow-visible p-0 shadow-none">
              <img
                src={LANDING_REMOTE_IMAGE}
                alt="Fjernkontroll for adgangskode"
                className="pointer-events-none absolute left-1/2 top-0 h-full w-auto max-w-none -translate-x-1/2 select-none object-contain drop-shadow-[0_26px_40px_rgba(0,0,0,0.48)]"
                draggable={false}
              />
              {LANDING_REMOTE_HOTSPOTS.map((hotspot) => (
                <button
                  key={hotspot.id}
                  type="button"
                  data-hotspot-id={hotspot.id}
                  aria-label={hotspot.label}
                  onClick={() => handleControlAction(hotspot.action, hotspot.id)}
                  className={`absolute rounded-[0.7rem] border border-transparent bg-transparent transition-all duration-150 focus-visible:border-white/70 focus-visible:bg-white/10 focus-visible:outline-none ${
                    pressedControlId === hotspot.id
                      ? 'access-remote-hotspot-active border-[#ffd38d]/55 bg-[#ffd38d]/18'
                      : 'hover:border-white/12 hover:bg-white/[0.04]'
                  }`}
                  style={{
                    left: `${hotspot.left}%`,
                    top: `${hotspot.top}%`,
                    width: `${hotspot.width}%`,
                    height: `${hotspot.height}%`,
                  }}
                />
              ))}
            </div>
            <div className="pointer-events-none absolute inset-x-[18%] bottom-[2%] h-[8%] rounded-full bg-black/45 blur-xl" />
          </div>
        </aside>
      </div>
    </main>
  );
};

export default Home;
