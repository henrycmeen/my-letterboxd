import { type NextPage } from 'next';
import { useEffect, useRef, useState } from 'react';

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

const BOARD_ID = 'default';
const FALLBACK_SCREEN_IMAGE = '/VHS/backgrounds/floor-oak.png';

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

const Home: NextPage = () => {
  const [program, setProgram] = useState<ProgramResponse | null>(null);
  const [isPoweringOn, setIsPoweringOn] = useState(true);
  const [isPoweringOff, setIsPoweringOff] = useState(false);
  const powerOffTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: number | null = null;

    const loadProgram = async () => {
      try {
        const params = new URLSearchParams({ boardId: BOARD_ID });
        const response = await fetch(`/api/club/next?${params.toString()}`);
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
  }, []);

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
      window.location.href = '/floor';
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

export default Home;
