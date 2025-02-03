import type { FC } from 'react';

interface MovieProps {
  title: string;
  image: string;
}

const MovieCard: FC<MovieProps> = ({ title, image }) => {
  return (
    <div className="group relative w-full aspect-[2/3] overflow-hidden transition-transform duration-300 hover:scale-105">
      <img src={image} alt={title} className="h-full w-full object-cover" />
      <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/70 to-transparent p-4 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
      </div>
    </div>
  );
};

export default MovieCard;