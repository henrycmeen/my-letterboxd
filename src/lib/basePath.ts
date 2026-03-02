const normalizeBasePath = (value?: string): string => {
  const trimmed = (value ?? '').trim();
  if (!trimmed || trimmed === '/') {
    return '';
  }

  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
};

export const BASE_PATH = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH);

export const withBasePath = (path: string): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!BASE_PATH) {
    return normalizedPath;
  }

  if (normalizedPath === BASE_PATH || normalizedPath.startsWith(`${BASE_PATH}/`)) {
    return normalizedPath;
  }

  return `${BASE_PATH}${normalizedPath}`;
};
