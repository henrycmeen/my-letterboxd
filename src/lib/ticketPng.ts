const TARGET_WIDTH = 1200;
const TARGET_HEIGHT = 2850;
const MAX_OUTPUT_PIXELS = 6_000_000;
const MAX_SCALE = 4;

export interface TicketPngDimensions {
  width: number;
  height: number;
  scale: number;
}

export interface TicketPngOptions {
  signal?: AbortSignal;
}

const createAbortError = (): Error => {
  const error = new Error("Ticket PNG rendering was cancelled.");
  error.name = "AbortError";
  return error;
};

const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw createAbortError();
  }
};

/**
 * Pick a predictable, high resolution canvas size without allowing a small
 * mobile preview to request an unbounded number of pixels.
 */
export const getTicketPngDimensions = (
  sourceWidth: number,
  sourceHeight: number,
): TicketPngDimensions => {
  const width =
    Number.isFinite(sourceWidth) && sourceWidth > 0
      ? sourceWidth
      : TARGET_WIDTH;
  const height =
    Number.isFinite(sourceHeight) && sourceHeight > 0
      ? sourceHeight
      : TARGET_HEIGHT;
  const targetScale = TARGET_WIDTH / width;
  const pixelBoundScale = Math.sqrt(MAX_OUTPUT_PIXELS / (width * height));
  const scale = Math.min(MAX_SCALE, targetScale, pixelBoundScale);

  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
    scale,
  };
};

const waitForImages = async (
  node: HTMLElement,
  signal?: AbortSignal,
): Promise<void> => {
  const images = Array.from(node.querySelectorAll("img"));

  await Promise.all(
    images.map((image) => {
      throwIfAborted(signal);
      if (image.complete) {
        return Promise.resolve();
      }

      return new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          image.removeEventListener("load", finish);
          image.removeEventListener("error", finish);
          signal?.removeEventListener("abort", cancel);
        };
        const finish = () => {
          cleanup();
          resolve();
        };
        const cancel = () => {
          cleanup();
          reject(createAbortError());
        };

        image.addEventListener("load", finish, { once: true });
        image.addEventListener("error", finish, { once: true });
        signal?.addEventListener("abort", cancel, { once: true });
      });
    }),
  );
};

const waitForFonts = async (signal?: AbortSignal): Promise<void> => {
  if (typeof document === "undefined" || !document.fonts) {
    return;
  }

  throwIfAborted(signal);
  await document.fonts.ready;
  throwIfAborted(signal);
};

export const renderTicketPng = async (
  node: HTMLElement,
  options: TicketPngOptions = {},
): Promise<string> => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("PNG export is only available in a browser.");
  }

  const { signal } = options;
  throwIfAborted(signal);
  await waitForFonts(signal);
  await waitForImages(node, signal);
  throwIfAborted(signal);

  // Keep html-to-image out of the server bundle and load it only when an
  // export is requested.
  const { toPng } = await import("html-to-image");
  throwIfAborted(signal);

  const bounds = node.getBoundingClientRect();
  const dimensions = getTicketPngDimensions(bounds.width, bounds.height);

  const dataUrl = await toPng(node, {
    cacheBust: true,
    width: bounds.width,
    height: bounds.height,
    pixelRatio: dimensions.scale,
  });
  throwIfAborted(signal);
  return dataUrl;
};

const slugifyTitle = (title: string): string => {
  const slug = title
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return slug || "film";
};

export const getTicketPngFilename = (title: string): string =>
  `filmklubben-${slugifyTitle(title)}.png`;
