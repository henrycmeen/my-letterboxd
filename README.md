# Filmklubben

Finn neste film sammen. En enkel filmklubb med VHS-covere, avstemning og trailere på en retro-TV.

**[Prøv demoen →](https://henrymeen.no/filmklubb/)**

I demoen flytter filmene seg når du velger dem. Valgene finnes bare i nettleseren og nullstilles når siden lastes på nytt. Ingen innlogging eller database er nødvendig for demoen.

## Kjør lokalt

Du trenger Node.js 24 og pnpm 10.

```bash
git clone https://github.com/henrycmeen/my-letterboxd.git
cd my-letterboxd
pnpm install
pnpm dev
```

Åpne [localhost:3000](http://localhost:3000). Demoen bruker filmene og bildene som følger med prosjektet.

## Din egen filmklubb

Klubbversjonen lagrer stemmer i SQLite. Tilpass filmer i [`src/data/filmVoteCatalogue.json`](src/data/filmVoteCatalogue.json) og visninger i [`src/data/filmClubProgramme.json`](src/data/filmClubProgramme.json). Dette gjøres foreløpig i koden.

For å hente nye filmer fra TMDB: kopier `.env.example` til `.env` og legg inn din egen `TMDB_API_KEY`.

Bygget med Next.js og React. Filmdata og bilder fra [TMDB](https://www.themoviedb.org), trailere fra YouTube. Filmplakater og logoer tilhører sine respektive rettighetshavere.
