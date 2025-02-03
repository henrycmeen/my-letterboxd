import { MovieBase } from '../movies';

const TMDB_API_KEY = 'b40b3f42afa7ac2ca22c0ca3d57897b0';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

interface TMDBMovie {
  id: number;
  title: string;
  release_date: string;
  poster_path: string | null;
}

interface TMDBSearchResponse {
  results: TMDBMovie[];
}

export const searchMovie = async (title: string, year: number): Promise<string | null> => {
  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&year=${year}`
    );
    
    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status}`);
    }

    const data: TMDBSearchResponse = await response.json();
    const movie = data.results[0];
    
    return movie?.poster_path
      ? `${TMDB_IMAGE_BASE_URL}${movie.poster_path}`
      : null;
  } catch (error) {
    console.error(`Error searching for movie ${title}:`, error);
    return null;
  }
};

export const getMoviePoster = async (movie: MovieBase): Promise<string> => {
  const posterUrl = await searchMovie(movie.title, movie.year);
  return posterUrl || '/placeholder.jpg';
};