import { type FC, useState } from 'react';

interface VHSCoverflowProps {
  movies: Array<{
    title: string;
    coverImage: string;
  }>;
}

import RetroDigitalClock from './RetroDigitalClock';

const VHSCoverflow: FC<VHSCoverflowProps> = ({ movies }) => {
  const [centerIndex, setCenterIndex] = useState(1);

  return (
    <div className="fixed inset-0 w-full h-full bg-black flex items-center justify-center overflow-hidden">
      <div className="relative w-[90vw] max-w-5xl mx-auto aspect-[4/3] bg-black p-3 rounded-[2rem] shadow-2xl">
        <div className="relative w-full h-full overflow-hidden rounded-lg bg-gray-900 p-6 retro-gradient
          before:pointer-events-none before:absolute before:inset-0 before:z-10 
          before:bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.1)_50%)] before:bg-[length:100%_4px] before:content-[''] 
          after:pointer-events-none after:absolute after:inset-0 after:z-10 
          after:bg-[radial-gradient(circle_800px_at_50%_50%,rgba(255,255,255,0.1),transparent_80%)] 
          [&>*]:relative [&>*]:z-[1]
          [transform:perspective(1000px)_rotateX(2deg)]
          shadow-[0_0_50px_rgba(32,224,227,0.15),inset_0_0_20px_rgba(32,224,227,0.15)]
          before:[box-shadow:inset_0_0_10px_rgba(32,224,227,0.2)]
          before:[animation:scanline_1_8s_linear_infinite]
          after:[animation:flicker_0.15s_infinite]
          ">
          <div className="relative flex justify-center items-center min-h-[400px] py-8 px-4 w-full h-full">
            {movies.map((movie, index) => (
              <div
                key={movie.title}
                onClick={() => setCenterIndex(index)}
                className={`absolute group aspect-[2/3] w-full max-w-[280px] cursor-pointer transform-gpu transition-all duration-300 ease-out hover:z-20
                  ${index === centerIndex ? 'z-10 scale-110' : 'scale-95 opacity-75 hover:opacity-90'}`}
                style={{
                  left: `${5 + (index * 28)}%`,
                  top: '50%',
                  transform: `translateY(-50%) rotate(${-8 + (index * 5)}deg)`,
                  zIndex: index === centerIndex ? 10 : index
                }}
              >
                <div className="relative h-full w-full transform transition-transform duration-300 group-hover:rotate-1 group-hover:scale-110">
                  <div className="absolute -bottom-4 -right-4 -left-[-20%] h-[102%] opacity-0 group-hover:opacity-100 transition-all duration-300 transform -translate-x-[20%] group-hover:translate-x-0">
                    <img
                      src="/VHS/Front Side.png"
                      alt="VHS case"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <img
                    src={movie.coverImage}
                    alt={movie.title}
                    className="relative z-10 h-full w-full object-cover transition-[filter] duration-300 drop-shadow-[0_14px_16px_rgba(0,0,0,0.34)] group-hover:drop-shadow-[0_20px_24px_rgba(0,0,0,0.46)]"
                  />
                </div>
              </div>
            ))}
          </div>
          <RetroDigitalClock />
        </div>
      </div>
    </div>
  );
};

export default VHSCoverflow;
