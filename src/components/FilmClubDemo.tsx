import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import { NextFilmTv } from "@/components/NextFilmTv";
import { VhsCaseArtwork } from "@/components/VhsCaseArtwork";
import catalogue from "@/data/filmVoteCatalogue.json";
import styles from "@/styles/filmClubProgram.module.css";
import demo from "@/styles/filmClubDemo.module.css";

// Local preview only: never mount the real vote wall or write a club vote.
export const FilmClubDemo = () => {
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [suppressedId, setSuppressedId] = useState<number | null>(null);
  const selectedIds = [...selected];
  const movie =
    catalogue.find((film) => film.id === selectedIds.at(-1)) ?? catalogue[0]!;

  return (
    <div className={styles.programPage}>
      <Head>
        <title>Filmklubben · demo</title>
        <meta
          name="description"
          content="Prøv Filmklubben: VHS-covere, filmvalg og trailere. En demo uten innlogging."
        />
      </Head>
      <header className={demo.header}>
        <span>Filmklubben – finn neste film sammen.</span>
        <a href="https://github.com/henrycmeen/my-letterboxd">
          Koden på GitHub ↗
        </a>
      </header>
      <main>
        <section
          className={styles.nextSection}
          aria-label="Trailer for ditt filmvalg"
        >
          <div className={styles.nextLayout}>
            <div className={styles.nextCase}>
              <NextFilmTv movie={movie} />
            </div>
          </div>
        </section>
        <section
          className={styles.voteWallSection}
          aria-label="Prøv filmvelgeren"
        >
          <ol className={styles.voteGrid} aria-label="Prøv filmcoverene">
            {catalogue.map((film, index) => (
              <li key={film.id}>
                <button
                  type="button"
                  className={styles.voteFilm}
                  aria-label={`${selected.has(film.id) ? "Lukk" : "Åpne"} ${film.title}`}
                  aria-pressed={selected.has(film.id)}
                  data-case-open={selected.has(film.id)}
                  data-suppress-preview={suppressedId === film.id || undefined}
                  onPointerLeave={() => setSuppressedId(null)}
                  onBlur={() => setSuppressedId(null)}
                  onClick={() => {
                    setSuppressedId(film.id);
                    setSelected((previous) => {
                      const next = new Set(previous);
                      if (next.has(film.id)) next.delete(film.id);
                      else next.add(film.id);
                      return next;
                    });
                  }}
                >
                  <VhsCaseArtwork
                    coverImage={film.coverImage}
                    title={film.title}
                    eager={index < 30}
                  />
                </button>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <footer className={demo.footer}>
        <span>Demo · Valgene lagres ikke.</span>
        <Link href="/inngang">Har du en klubbkode?</Link>
        <span>
          Filmdata og bilder fra <a href="https://www.themoviedb.org">TMDB</a>.
          Trailere fra YouTube.
        </span>
      </footer>
    </div>
  );
};
