export const buildYoutubeTrailerEmbedUrl = (youtubeId: string): string => {
  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    controls: "0",
    loop: "1",
    playlist: youtubeId,
    playsinline: "1",
    rel: "0",
    disablekb: "1",
    fs: "0",
    cc_load_policy: "0",
    iv_load_policy: "3",
    enablejsapi: "1",
  });

  return `https://www.youtube-nocookie.com/embed/${youtubeId}?${params.toString()}`;
};

export const isYoutubePlayingMessage = (value: unknown): boolean => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as { event?: unknown; info?: unknown };
  if (message.event === "onStateChange") {
    return message.info === 1;
  }

  if (message.event !== "infoDelivery") {
    return false;
  }

  return (
    !!message.info &&
    typeof message.info === "object" &&
    (message.info as { playerState?: unknown }).playerState === 1
  );
};
