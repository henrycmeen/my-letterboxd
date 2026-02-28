import { type NextPage } from 'next';
import { useEffect, useState } from 'react';
import VHSCoverflow from '../components/VHSCoverflow';

interface ClubMovie {
  id: number;
  title: string;
  coverImage: string;
}

interface CoversResponse {
  movies: ClubMovie[];
}

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

const FALLBACK_MOVIES: ClubMovie[] = [
  {
    id: 976893,
    title: 'Perfect Days',
    coverImage: '/VHS/generated/custom-976893-sharp-front-side-cover-flat-perfect-days.webp',
  },
  {
    id: 120,
    title: 'The Lord of the Rings',
    coverImage:
      '/VHS/generated/custom-120-sharp-front-side-cover-flat-the-lord-of-the-rings-the-fellowship-of-the-ring.webp',
  },
  {
    id: 62,
    title: '2001: A Space Odyssey',
    coverImage: '/VHS/generated/custom-62-sharp-front-side-cover-flat-2001-a-space-odyssey.webp',
  },
];

const CURATED_TITLES_QUERY = [
  'Perfect Days::2023',
  'The Lord of the Rings: The Fellowship of the Ring::2001',
  '2001: A Space Odyssey::1968',
].join('|');

const Home: NextPage = () => {
  const [movies, setMovies] = useState<ClubMovie[]>(FALLBACK_MOVIES);

  useEffect(() => {
    let ignore = false;

    const loadClubMovies = async () => {
      try {
        const params = new URLSearchParams({
          limit: '3',
          renderer: 'sharp',
          titles: CURATED_TITLES_QUERY,
        });

        const response = await fetch(`/api/vhs/covers?${params.toString()}`);
        if (!response.ok) {
          return;
        }

        const payloadRaw: unknown = await response.json();
        if (!isCoversResponse(payloadRaw)) {
          return;
        }

        if (!ignore && payloadRaw.movies.length > 0) {
          setMovies(payloadRaw.movies);
        }
      } catch {
        // Fallback to static covers when TMDB or render endpoint is unavailable.
      }
    };

    void loadClubMovies();

    return () => {
      ignore = true;
    };
  }, []);

  return (
    <main>
      <VHSCoverflow movies={movies} />
    </main>
  );
};

export default Home;
