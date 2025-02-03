import { parseRatings, parseDiary } from './utils/csvParser';
import { getMoviePoster } from './utils/tmdbService';

export interface MovieBase {
  title: string;
  year: number;
  letterboxdUri: string;
}

export interface RatedMovie extends MovieBase {
  rating: number;
  ratingDate: string;
}

export interface DiaryEntry extends RatedMovie {
  rewatch: boolean;
  tags: string[];
  watchedDate: string;
}

export interface MovieDisplay {
  title: string;
  image: string;
}

// Initialize with data from API
export let ratedMovies: RatedMovie[] = [];
export let diaryEntries: DiaryEntry[] = [];

// Load data from API
export const loadMovieData = async () => {
  try {
    const response = await fetch('/api/movies');
    if (!response.ok) {
      throw new Error('Failed to fetch movie data');
    }
    const data = await response.json();
    ratedMovies = data.ratings;
    diaryEntries = data.diary;
  } catch (error) {
    console.error('Error loading movie data:', error);
  }
};

// Helper functions
export const getHighestRatedMovies = (limit: number = 5): RatedMovie[] => {
  return [...ratedMovies].sort((a, b) => b.rating - a.rating).slice(0, limit);
};

export const getRecentlyWatchedMovies = (limit: number = 5): DiaryEntry[] => {
  return [...diaryEntries]
    .sort((a, b) => new Date(b.watchedDate).getTime() - new Date(a.watchedDate).getTime())
    .slice(0, limit);
};

export const getTopMoviesWithPosters = async (): Promise<MovieDisplay[]> => {
  const topRatedMovies = getHighestRatedMovies(3);
  return Promise.all(
    topRatedMovies.map(async (movie) => ({
      title: movie.title,
      image: await getMoviePoster(movie)
    }))
  );
};

export const getLastWatchedWithPosters = async (): Promise<MovieDisplay[]> => {
  const recentMovies = getRecentlyWatchedMovies(9);
  return Promise.all(
    recentMovies.map(async (movie) => ({
      title: movie.title,
      image: await getMoviePoster(movie)
    }))
  );
};

export const topMovies: MovieDisplay[] = [
  { title: "The Lighthouse", image: "/the-lighthouse.jpg" },
  { title: "Burning", image: "/burning.jpg" },
  { title: "Perfect Days", image: "/perfect-days.jpg" },
];

// Remove static initialization and use the async function instead
export const lastWatched = getLastWatchedWithPosters;

