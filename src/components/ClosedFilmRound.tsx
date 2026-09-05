import { FilmResultSpine } from "@/components/FilmResultSpine";
import Head from "next/head";
import { useEffect, useMemo, useRef, useState } from "react";
import { FilmTicket } from "@/components/FilmTicket";
import { TicketFinale } from "@/components/TicketFinale";
import { VhsCaseArtwork } from "@/components/VhsCaseArtwork";
import type { DemoFinalist } from "@/lib/filmTicket";
import type { FilmRoundSnapshot } from "@/lib/filmRoundClient";
import programStyles from "@/styles/filmClubProgram.module.css";
import styles from "@/styles/closedFilmRound.module.css";

interface ClosedFilmRoundProps {
  snapshot: FilmRoundSnapshot;
}

const formatLockedAt = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Tidspunkt ikke tilgjengelig";
  }

  return new Intl.DateTimeFormat("nb-NO", {
    timeZone: "Europe/Oslo",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export const ClosedFilmRound = ({ snapshot }: ClosedFilmRoundProps) => {
  const [introComplete, setIntroComplete] = useState(false);
  const [finaleOpen, setFinaleOpen] = useState(false);
  const finaleLaunchedRef = useRef(false);
  const ranking = snapshot.ranking;
  const winnerEntry = ranking[0];
  const winnerTicket = snapshot.ticket;
  const hasWinner = winnerEntry !== undefined && winnerTicket !== null;
  const finalists = useMemo<DemoFinalist[]>(
    () => ranking.map(({ film, votes }) => ({ film, votes })),
    [ranking],
  );
  const introFilms = ranking.slice(0, 3);

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reducedMotion || introFilms.length === 0) {
      setIntroComplete(true);
      return;
    }

    const timer = window.setTimeout(() => setIntroComplete(true), 1_700);
    return () => window.clearTimeout(timer);
  }, [introFilms.length]);

  useEffect(() => {
    if (!introComplete || !hasWinner || finaleLaunchedRef.current) {
      return;
    }

    finaleLaunchedRef.current = true;
    setFinaleOpen(true);
  }, [hasWinner, introComplete]);

  const closeFinale = () => {
    setFinaleOpen(false);
  };

  return (
    <div className={styles.page}>
      <Head>
        <title>Filmklubben · Resultater</title>
        <meta
          name="description"
          content="Resultatet fra Filmklubbens avsluttede avstemning."
        />
      </Head>

      {!introComplete ? (
        <section
          className={styles.intro}
          aria-label="Avstemningen er avsluttet"
        >
          <p className={styles.kicker}>FILMKLUBBEN / RESULTAT</p>
          <h1>Avstemningen er avsluttet</h1>
          <p className={styles.introMeta}>
            {formatLockedAt(snapshot.lockedAt)}
          </p>
          <div className={styles.introCases} aria-hidden="true">
            {introFilms.map(({ film }, index) => (
              <span
                className={`${programStyles.voteFilm} ${styles.introCase}`}
                data-case-open="true"
                key={film.id}
                style={{ animationDelay: `${index * 130}ms` }}
              >
                <VhsCaseArtwork
                  coverImage={film.coverImage}
                  title={film.title}
                  eager
                />
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <main
        className={styles.settled}
        data-visible={introComplete}
        aria-hidden={!introComplete}
      >
        <header className={styles.header}>
          <p className={styles.kicker}>FILMKLUBBEN / RESULTAT</p>
          <h1>Avstemningen er avsluttet</h1>
          <p className={styles.headerMeta}>
            {formatLockedAt(snapshot.lockedAt)}
          </p>
        </header>

        {hasWinner && winnerEntry && winnerTicket ? (
          <section
            className={styles.winner}
            aria-label={`Vinner: ${winnerEntry.film.title}`}
          >
            <p className={styles.kicker}>VINNEREN ER</p>
            <h2>{winnerEntry.film.title}</h2>
            <p className={styles.winnerMeta}>
              {winnerEntry.votes}{" "}
              {winnerEntry.votes === 1 ? "stemme" : "stemmer"} ·{" "}
              {winnerEntry.film.year}
            </p>
            {!finaleOpen ? (
              <div className={styles.winnerTicket}>
                <FilmTicket ticket={winnerTicket} />
              </div>
            ) : null}
          </section>
        ) : (
          <section className={styles.noWinner} aria-label="Ingen vinner">
            <p className={styles.kicker}>INGEN VINNER</p>
            <h2>Ingen film ble kåret.</h2>
            <p>Resultatene fra runden er bevart nedenfor.</p>
          </section>
        )}

        <section className={styles.results} aria-label="Hele avstemningen">
          <header className={styles.resultsHeader}>
            <h2>Hele avstemningen</h2>
            <span>
              {snapshot.stats.totalVotes}{" "}
              {snapshot.stats.totalVotes === 1 ? "stemme" : "stemmer"}
            </span>
          </header>
          <ol>
            {ranking.map(({ film, votes }, index) => (
              <li key={film.id} data-winner={hasWinner && index === 0}>
                <span className={styles.place}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className={styles.filmTitle}>
                  <FilmResultSpine film={film} />
                </span>
                <span className={styles.votes}>
                  <strong>{votes}</strong>
                  {votes === 1 ? "stemme" : "stemmer"}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </main>

      {finaleOpen && winnerEntry && winnerTicket ? (
        <TicketFinale
          finalists={finalists}
          demo={false}
          frozenTicket={winnerTicket}
          onClose={closeFinale}
        />
      ) : null}
    </div>
  );
};
