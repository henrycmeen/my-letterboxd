import { FC, useEffect, useState } from 'react';

const RetroDigitalClock: FC = () => {
  const [time, setTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = now.getHours().toString().padStart(2, '0');
      const minutes = now.getMinutes().toString().padStart(2, '0');
      setTime(`${hours}:${minutes}`);
    };

    // Update immediately and then every second
    updateTime();
    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="absolute bottom-[-4rem] left-1/2 transform -translate-x-1/2 z-50">
      <div className="
        font-mono text-4xl tracking-wider
        text-[#ff0000] 
        shadow-[0_0_15px_rgba(255,0,0,0.7)]
        animate-pulse
        bg-black/20
        px-6
        py-3
        rounded-lg
        backdrop-blur-sm
        border border-red-500/30
      ">
        {time}
      </div>
    </div>
  );
};

export default RetroDigitalClock;