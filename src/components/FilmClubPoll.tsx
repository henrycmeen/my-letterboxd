import { type FormEvent, useMemo, useState } from "react";
import { POLL_FILMS } from "@/components/filmClubProgramData";
import { VhsProgramCase } from "@/components/VhsProgramCase";
import { applyFilmVote, type FilmPollCount } from "@/lib/filmPoll";
import styles from "@/styles/filmClubProgram.module.css";

export const FilmClubPoll = () => {
  const [selectedId, setSelectedId] = useState<string>(POLL_FILMS[0].id);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [counts, setCounts] = useState<FilmPollCount[]>(() =>
    POLL_FILMS.map(({ id, votes }) => ({ id, votes })),
  );

  const totalVotes = useMemo(
    () => counts.reduce((total, entry) => total + entry.votes, 0),
    [counts],
  );

  const submitVote = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCounts((current) => applyFilmVote(current, submittedId, selectedId));
    setSubmittedId(selectedId);
  };

  return (
    <section className={styles.pollSection} id="avstemning">
      <div className={styles.sectionIntro}>
        <p>Avstemning</p>
        <h2>Hva skal vi se etterpå?</h2>
        <span>Velg én film. Du kan ombestemme deg.</span>
      </div>

      <form className={styles.pollForm} onSubmit={submitVote}>
        <div className={styles.pollOptions}>
          {POLL_FILMS.map(({ id, movie }) => {
            const votes = counts.find((entry) => entry.id === id)?.votes ?? 0;
            const percentage = totalVotes > 0 ? (votes / totalVotes) * 100 : 0;

            return (
              <article className={styles.pollOption} key={id}>
                <VhsProgramCase movie={movie} size="poll" />
                <label className={styles.pollLabel}>
                  <input
                    type="radio"
                    name="film"
                    value={id}
                    checked={selectedId === id}
                    onChange={() => setSelectedId(id)}
                  />
                  <span>
                    <strong>{movie.title}</strong>
                    <small>
                      {movie.director}, {movie.year}
                    </small>
                  </span>
                </label>
                <div
                  className={styles.pollResult}
                  aria-label={`${votes} stemmer`}
                >
                  <progress max={100} value={percentage} />
                  <small>{votes} stemmer</small>
                </div>
              </article>
            );
          })}
        </div>

        <div className={styles.pollActions}>
          <button type="submit">
            {submittedId ? "Oppdater stemmen" : "Stem på filmen"}
          </button>
          <p role="status" aria-live="polite">
            {submittedId
              ? `Stemmen din er registrert på ${
                  POLL_FILMS.find(({ id }) => id === submittedId)?.movie.title
                }.`
              : "Avstemningen lagres bare i denne lokale prototypen."}
          </p>
        </div>
      </form>
    </section>
  );
};
