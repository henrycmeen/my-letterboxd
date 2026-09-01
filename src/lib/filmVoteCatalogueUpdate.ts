export interface VoteCatalogueUpdateRequest {
  addIds: number[];
  removeIds: number[];
}

const parseTmdbId = (value: string | undefined, flag: string): number => {
  if (value === undefined) {
    throw new Error(`${flag} requires a TMDB id`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} requires a positive integer TMDB id`);
  }

  return parsed;
};

export const parseVoteCatalogueUpdateArgs = (
  args: readonly string[],
): VoteCatalogueUpdateRequest => {
  const addIds: number[] = [];
  const removeIds: number[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) {
      continue;
    }
    if (argument === "--") {
      continue;
    }

    const equalsIndex = argument.indexOf("=");
    const flag = equalsIndex >= 0 ? argument.slice(0, equalsIndex) : argument;
    const inlineValue =
      equalsIndex >= 0 ? argument.slice(equalsIndex + 1) : undefined;

    if (flag !== "--add" && flag !== "--remove") {
      throw new Error(`Unknown catalogue option: ${argument}`);
    }

    const value = inlineValue ?? args[index + 1];
    if (inlineValue === undefined) {
      index += 1;
    }

    const id = parseTmdbId(value, flag);
    const target = flag === "--add" ? addIds : removeIds;
    if (!target.includes(id)) {
      target.push(id);
    }
  }

  const removeSet = new Set(removeIds);
  const conflict = addIds.find((id) => removeSet.has(id));
  if (conflict !== undefined) {
    throw new Error(`TMDB film ${conflict} cannot be both added and removed`);
  }

  if (addIds.length === 0 && removeIds.length === 0) {
    throw new Error("Provide at least one --add or --remove TMDB id");
  }

  return { addIds, removeIds };
};

export const nextVoteCoverSequence = (
  coverImages: readonly string[],
): number => {
  const sequences = coverImages
    .map((coverImage) => /\/(\d{3})-[^/]+\.webp$/.exec(coverImage)?.[1])
    .map((sequence) => Number(sequence ?? 0));

  return Math.max(0, ...sequences) + 1;
};

export const buildVoteCoverFileName = (
  sequence: number,
  title: string,
): string => {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  if (!Number.isInteger(sequence) || sequence <= 0 || !slug) {
    throw new Error("Cannot build a vote-cover filename");
  }

  return `${String(sequence).padStart(3, "0")}-${slug}.webp`;
};
