import { DEFAULT_CLUB_SLUG } from '@/lib/clubSlug';

export const ACCESS_CODE_LENGTH = 3;

export const ACCESS_CODE_MAP = {
  '000': DEFAULT_CLUB_SLUG,
  '456': DEFAULT_CLUB_SLUG,
  '123': 'nasjonalarkivet',
} as const satisfies Record<string, string>;

export const resolveClubSlugFromAccessCode = (
  code: string
): string | null => ACCESS_CODE_MAP[code as keyof typeof ACCESS_CODE_MAP] ?? null;
