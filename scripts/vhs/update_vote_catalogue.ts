import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildVoteCoverFileName,
  nextVoteCoverSequence,
  parseVoteCatalogueUpdateArgs,
} from "../../src/lib/filmVoteCatalogueUpdate";
import {
  getTmdbMovieById,
  getTmdbMovieTrailerYoutubeId,
} from "../../src/lib/tmdb";
import {
  generateVoteCovers,
  type VoteCoverSource,
} from "./generate_vote_covers";

interface VoteFilm {
  id: number;
  title: string;
  year: number;
  tmdbVoteAverage: number;
  coverImage: string;
  trailerYoutubeId: string;
}

const CATALOGUE_PATH = path.join(
  process.cwd(),
  "src/data/filmVoteCatalogue.json",
);
const MANIFEST_PATH = path.join(
  process.cwd(),
  "scripts/vhs/vote_cover_sources.json",
);
const COVER_DIRECTORY = path.join(
  process.cwd(),
  "public/VHS/program/vote-covers",
);

const writeJsonAtomically = async (
  destination: string,
  value: unknown,
): Promise<void> => {
  const temporary = `${destination}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, destination);
};

const posterPathFromUrl = (posterUrl: string): string => {
  const filename = path.posix.basename(new URL(posterUrl).pathname);
  if (!/^[A-Za-z0-9._-]+\.(?:jpe?g|png)$/i.test(filename)) {
    throw new Error(`TMDB returned an invalid poster URL: ${posterUrl}`);
  }
  return `/${filename}`;
};

const request = parseVoteCatalogueUpdateArgs(process.argv.slice(2));
const catalogue = JSON.parse(
  await readFile(CATALOGUE_PATH, "utf8"),
) as VoteFilm[];
const manifest = JSON.parse(
  await readFile(MANIFEST_PATH, "utf8"),
) as VoteCoverSource[];
const existingIds = new Set(catalogue.map(({ id }) => id));
const newIds = request.addIds.filter((id) => !existingIds.has(id));
const firstCoverSequence = nextVoteCoverSequence(
  catalogue.map(({ coverImage }) => coverImage),
);

const additions = await Promise.all(
  newIds.map(
    async (id, index): Promise<{ film: VoteFilm; source: VoteCoverSource }> => {
      const [movie, trailerYoutubeId] = await Promise.all([
        getTmdbMovieById(id),
        getTmdbMovieTrailerYoutubeId(id),
      ]);

      if (!movie) {
        throw new Error(`TMDB film ${id} was not found`);
      }
      if (movie.year === null || movie.year >= new Date().getFullYear()) {
        throw new Error(`${movie.title} must predate the current year`);
      }
      if (!movie.posterUrl) {
        throw new Error(`${movie.title} has no TMDB poster`);
      }
      if (!trailerYoutubeId) {
        throw new Error(`${movie.title} has no YouTube trailer on TMDB`);
      }

      const outputFile = buildVoteCoverFileName(
        firstCoverSequence + index,
        movie.title,
      );

      return {
        film: {
          id: movie.id,
          title: movie.title,
          year: movie.year,
          tmdbVoteAverage: movie.voteAverage,
          coverImage: `/VHS/program/vote-covers/${outputFile}`,
          trailerYoutubeId,
        },
        source: {
          tmdbId: movie.id,
          posterPath: posterPathFromUrl(movie.posterUrl),
          outputFile,
        },
      };
    },
  ),
);

await generateVoteCovers(additions.map(({ source }) => source));

const removeSet = new Set(request.removeIds);
const removed = catalogue.filter(({ id }) => removeSet.has(id));
const nextCatalogue = catalogue
  .filter(({ id }) => !removeSet.has(id))
  .concat(additions.map(({ film }) => film));
const nextManifest = manifest
  .filter(({ tmdbId }) => !removeSet.has(tmdbId))
  .concat(additions.map(({ source }) => source));

await writeJsonAtomically(CATALOGUE_PATH, nextCatalogue);
await writeJsonAtomically(MANIFEST_PATH, nextManifest);

for (const film of removed) {
  try {
    await unlink(path.join(COVER_DIRECTORY, path.basename(film.coverImage)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

for (const id of request.addIds.filter((id) => existingIds.has(id))) {
  console.log(`Already present: TMDB ${id}`);
}
for (const id of request.removeIds.filter((id) => !existingIds.has(id))) {
  console.log(`Already absent: TMDB ${id}`);
}
for (const { film } of additions) {
  console.log(`Added: ${film.title} (${film.year})`);
}
for (const film of removed) {
  console.log(`Removed: ${film.title} (${film.year})`);
}
console.log(`Vote catalogue now contains ${nextCatalogue.length} films.`);
