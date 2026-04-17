const DEFAULT_CLUB_SLUG = 'default';

const CLUB_SLUG_SANITIZE_PATTERN = /[^a-z0-9-]+/g;

export const normalizeClubSlug = (value?: string): string => {
  const normalized = (value ?? '')
    .trim()
    .toLowerCase()
    .replace(CLUB_SLUG_SANITIZE_PATTERN, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || DEFAULT_CLUB_SLUG;
};

export const resolveClubSlugParam = (
  value: string | string[] | undefined
): string => normalizeClubSlug(Array.isArray(value) ? value[0] : value);

export const getBoardIdFromClubSlug = (clubSlug?: string): string =>
  normalizeClubSlug(clubSlug);

export const getClubHomePath = (clubSlug?: string): string => {
  const normalizedClubSlug = normalizeClubSlug(clubSlug);
  return `/${normalizedClubSlug}`;
};

export const getClubFloorPath = (clubSlug?: string): string => {
  const homePath = getClubHomePath(clubSlug);
  return `${homePath}/filmvelger`;
};

export { DEFAULT_CLUB_SLUG };
