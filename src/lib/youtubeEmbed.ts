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

export const isYoutubePausedMessage = (value: unknown): boolean => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as { event?: unknown; info?: unknown };
  if (message.event === "onStateChange") {
    return message.info === 2;
  }

  if (message.event !== "infoDelivery") {
    return false;
  }

  return (
    !!message.info &&
    typeof message.info === "object" &&
    (message.info as { playerState?: unknown }).playerState === 2
  );
};

export const isYoutubeBufferingMessage = (value: unknown): boolean => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as { event?: unknown; info?: unknown };
  if (message.event === "onStateChange") {
    return message.info === 3;
  }

  if (message.event !== "infoDelivery") {
    return false;
  }

  return (
    !!message.info &&
    typeof message.info === "object" &&
    (message.info as { playerState?: unknown }).playerState === 3
  );
};

export const isYoutubeAutoplayBlockedMessage = (value: unknown): boolean =>
  !!value &&
  typeof value === "object" &&
  (value as { event?: unknown }).event === "onAutoplayBlocked";

export const isYoutubeErrorMessage = (value: unknown): boolean =>
  !!value &&
  typeof value === "object" &&
  (value as { event?: unknown }).event === "onError";

export const isYoutubeReadyMessage = (value: unknown): boolean =>
  !!value &&
  typeof value === "object" &&
  (value as { event?: unknown }).event === "onReady";

export const isYoutubeEndedMessage = (value: unknown): boolean => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as { event?: unknown; info?: unknown };
  if (message.event === "onStateChange") {
    return message.info === 0;
  }

  if (message.event !== "infoDelivery") {
    return false;
  }

  return (
    !!message.info &&
    typeof message.info === "object" &&
    (message.info as { playerState?: unknown }).playerState === 0
  );
};

export interface YoutubePlaybackProgress {
  currentTime: number;
  duration: number;
}

export const getYoutubePlaybackProgress = (
  value: unknown,
): YoutubePlaybackProgress | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const message = value as { event?: unknown; info?: unknown };
  if (
    message.event !== "infoDelivery" ||
    !message.info ||
    typeof message.info !== "object"
  ) {
    return null;
  }

  const info = message.info as {
    currentTime?: unknown;
    duration?: unknown;
    progressState?: unknown;
  };
  const progressState =
    info.progressState && typeof info.progressState === "object"
      ? (info.progressState as { current?: unknown; duration?: unknown })
      : null;
  const currentTime = info.currentTime ?? progressState?.current;
  const duration = info.duration ?? progressState?.duration;
  if (
    typeof currentTime !== "number" ||
    !Number.isFinite(currentTime) ||
    typeof duration !== "number" ||
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    return null;
  }

  return { currentTime, duration };
};

export const shouldRestartYoutubeTrailer = (
  value: unknown,
  cutoffRatio = 0.9,
): boolean => {
  const progress = getYoutubePlaybackProgress(value);
  return (
    progress !== null && progress.currentTime >= progress.duration * cutoffRatio
  );
};
