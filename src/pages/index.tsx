import { useEffect, useState } from "react";
import MovieCard from "@/components/MovieCard";
import { loadMovieData, getHighestRatedMovies, getRecentlyWatchedMovies, topMovies, lastWatched, getLastWatchedWithPosters, MovieDisplay } from "@/data/movies";

export default function Home() {
  const [lastWatchedMovies, setLastWatchedMovies] = useState<MovieDisplay[]>([]);

  useEffect(() => {
    const loadData = async () => {
      await loadMovieData();
      const lastWatched = await getLastWatchedWithPosters();
      setLastWatchedMovies(lastWatched);
    };
    loadData();
  }, []);

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-6">
      <h1 className="text-4xl font-bold mb-6">Henry Meen</h1>

      <section className="w-full max-w-4xl">
        <h2 className="text-xl font-semibold mb-4">Topp 3</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 justify-items-center">
          {topMovies.map((movie, index) => (
            <MovieCard key={index} title={movie.title} image={movie.image} />
          ))}
        </div>
      </section>

      <section className="w-full max-w-4xl mt-10">
        <h2 className="text-xl font-semibold mb-4">Sist sett</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 justify-items-center">
          {lastWatchedMovies.map((movie, index) => (
            <MovieCard key={index} title={movie.title} image={movie.image} />
          ))}
        </div>
      </section>
    </main>
  );
}