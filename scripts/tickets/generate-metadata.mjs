import fs from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const read = async (file) =>
  JSON.parse(await fs.readFile(new URL(file, root), "utf8"));

const { getTmdbMovieTicketDetails, hasTmdbApiKey } = await import(
  "../../src/lib/tmdb.ts"
);
const { selectDirectors } = await import("../../src/lib/ticketMetadata.ts");

if (!hasTmdbApiKey()) {
  throw new Error("TMDB credentials are required to generate ticket metadata.");
}

const films = await read("src/data/filmVoteCatalogue.json");
const result = {};

for (const film of films) {
  let details;
  try {
    details = await getTmdbMovieTicketDetails(film.id);
  } catch {
    throw new Error(`TMDB metadata generation failed for movie ${film.id}.`);
  }
  const director = details ? selectDirectors(details.credits.crew) : undefined;
  result[String(film.id)] = director ? { director } : {};
}

await fs.writeFile(
  new URL("src/data/ticketMetadata.json", root),
  `${JSON.stringify(result, null, 2)}\n`,
  "utf8",
);

const directorCount = Object.values(result).filter(
  (metadata) => metadata.director,
).length;
console.log(`Generated ${directorCount}/${films.length} director entries.`);
