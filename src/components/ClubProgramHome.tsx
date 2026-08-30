import Head from "next/head";
import {
  formatArchiveDate,
  formatFilmDate,
  PAST_FILMS,
} from "@/components/filmClubProgramData";
import { FilmClubPoll } from "@/components/FilmClubPoll";
import { useClubNextMovie } from "@/components/useClubNextMovie";
import { VhsProgramCase } from "@/components/VhsProgramCase";
import { withBasePath } from "@/lib/basePath";
import { getBoardIdFromClubSlug, getClubFloorPath } from "@/lib/clubSlug";
import styles from "@/styles/filmClubProgram.module.css";

interface ClubProgramHomeProps {
  clubSlug: string;
}

export const ClubProgramHome = ({ clubSlug }: ClubProgramHomeProps) => {
  const nextMovie = useClubNextMovie(getBoardIdFromClubSlug(clubSlug));
  const floorPath = withBasePath(getClubFloorPath(clubSlug));

  return (
    <>
      <Head>
        <title>Filmklubben</title>
        <meta
          name="description"
          content="Neste film, tidligere visninger og avstemning i Filmklubben."
        />
      </Head>

      <main className={styles.programPage}>
        <header className={styles.siteHeader}>
          <a className={styles.wordmark} href="#neste">
            Filmklubben
          </a>
          <nav aria-label="Filmklubbens program">
            <a href="#neste">Neste</a>
            <a href="#tidligere">Tidligere</a>
            <a href="#avstemning">Avstemning</a>
            <a href={floorPath}>Velg film</a>
          </nav>
        </header>

        <section className={styles.nextSection} id="neste">
          <div className={styles.sectionLabel}>
            <span>Neste film</span>
            <span>Nr. 01 / 01</span>
          </div>

          <div className={styles.nextLayout}>
            <div className={styles.nextCase}>
              <VhsProgramCase movie={nextMovie} size="hero" />
              <p>Hold over eller trykk for å åpne etuiet.</p>
            </div>

            <div className={styles.nextDetails}>
              <p>
                En film av <span>{nextMovie.director}</span>
              </p>
              <h1>{nextMovie.title}</h1>
              <dl>
                <div>
                  <dt>Visning</dt>
                  <dd>{formatFilmDate(nextMovie.scheduledAt)}</dd>
                </div>
                <div>
                  <dt>År</dt>
                  <dd>{nextMovie.year}</dd>
                </div>
                <div>
                  <dt>Format</dt>
                  <dd>VHS</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        <section className={styles.archiveSection} id="tidligere">
          <div className={styles.sectionIntro}>
            <p>Tidligere</p>
            <h2>Filmer vi har sett</h2>
            <span>{PAST_FILMS.length} kassetter i arkivet</span>
          </div>

          <ol className={styles.archiveRail} aria-label="Tidligere filmer">
            {PAST_FILMS.map((movie, index) => (
              <li key={movie.id}>
                <VhsProgramCase movie={movie} />
                <div className={styles.archiveMeta}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{movie.title}</h3>
                    <p>
                      {movie.director} · {formatArchiveDate(movie.scheduledAt)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <FilmClubPoll />

        <footer className={styles.siteFooter}>
          <p>Filmklubben · Oslo · 2026</p>
          <a href="#neste">Til toppen</a>
        </footer>
      </main>
    </>
  );
};
