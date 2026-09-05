import Head from "next/head";
import { useState } from "react";
import { VhsCaseArtwork } from "@/components/VhsCaseArtwork";
import catalogue from "@/data/filmVoteCatalogue.json";
import styles from "@/styles/filmClubProgram.module.css";

// Deliberately no API, storage, TV, or vote-wall mounting in this local preview.
export default function VhsDemo() {
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  return (
    <main className={styles.programPage}>
      <Head>
        <title>Filmklubben · lokal VHS-demo</title>
        <meta name="robots" content="noindex" />
      </Head>
      <section
        className={styles.voteWallSection}
        aria-label="Lokal forhåndsvisning av VHS-valg"
      >
        <ol
          className={styles.voteGrid}
          aria-label="Prøv VHS-åpningen. Ingen stemmer lagres."
        >
          {catalogue.map((film, index) => (
            <li key={film.id}>
              <button
                type="button"
                className={styles.voteFilm}
                aria-label={`${selected.has(film.id) ? "Lukk" : "Åpne"} ${film.title}`}
                aria-pressed={selected.has(film.id)}
                data-case-open={selected.has(film.id)}
                onClick={() =>
                  setSelected((previous) => {
                    const next = new Set(previous);
                    if (next.has(film.id)) next.delete(film.id);
                    else next.add(film.id);
                    return next;
                  })
                }
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
  );
}
