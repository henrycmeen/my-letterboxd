import { createRequire } from "node:module";
const sharp = createRequire(new URL("../../package.json", import.meta.url))(
  "sharp",
);
import fs from "node:fs/promises";
const root = new URL("../../", import.meta.url);
const read = async (path) =>
  JSON.parse(await fs.readFile(new URL(path, root), "utf8"));
const films = await read("src/data/filmVoteCatalogue.json");
const labels = await read("src/data/filmCassetteLabels.json");
const sources = await read("scripts/vhs/cassette_label_sources.json");
const logoSources = await read("scripts/vhs/cassette_logo_sources.json");
const result = {};
for (const film of films) {
  const local = labels[film.coverImage] || film.coverImage;
  const { data, info } = await sharp(
    new URL("public" + film.coverImage, root).pathname,
  )
    .resize(48, 48, { fit: "inside" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let satTotal = 0,
    cos = 0,
    sin = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]].map((v) => v / 255);
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b),
      delta = max - min;
    if (delta < 0.08 || max < 0.12 || min > 0.85) continue;
    let hue =
      max === r
        ? ((g - b) / delta) % 6
        : max === g
          ? (b - r) / delta + 2
          : (r - g) / delta + 4;
    hue *= Math.PI / 3;
    cos += Math.cos(hue) * delta;
    sin += Math.sin(hue) * delta;
    satTotal += delta;
  }
  const hue = ((Math.atan2(sin, cos) * 180) / Math.PI + 360) % 360;
  const chroma = satTotal / (info.width * info.height);
  const palette =
    hue > 65 && hue < 275 && chroma > 0.012
      ? "mineral"
      : chroma < 0.055
        ? "ember"
        : hue > 280 || hue < 18
          ? "rose"
          : "ember";
  result[film.id] = {
    image:
      sources
        .find((s) => s.tmdbId === film.id)
        ?.source?.replace("/w300/", "/w1280/") || local,
    fallback: local,
    logo: logoSources
      .find((s) => s.tmdbId === film.id)
      ?.source?.replace("/w300/", "/original/"),
    palette,
  };
}
await fs.writeFile(
  new URL("src/data/ticketDemoArt.json", root),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(
  Object.fromEntries([10227, 149, 346].map((id) => [id, result[id]])),
);
