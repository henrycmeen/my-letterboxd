import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FilmTicket } from "@/components/FilmTicket";
import { TicketPrinter } from "@/components/TicketPrinter";
import { makeFilmTicket, type DemoFinalist } from "@/lib/filmTicket";
import { GeistSans } from "geist/font/sans";
import styles from "@/styles/ticketFinale.module.css";

export function TicketFinale({
  finalists,
  onClose,
}: {
  finalists: DemoFinalist[];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const revealTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [currentIndex, setCurrentIndex] = useState(finalists.length - 1);
  const [printing, setPrinting] = useState(false);
  const [finished, setFinished] = useState(false);
  const [skip, setSkip] = useState(false);
  const winner = finalists[0]!;
  const currentResult = finalists[currentIndex]!;
  const [ticket] = useState(() => makeFilmTicket(winner.film, "001"));

  useEffect(() => {
    const node = dialog.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    node.showModal();
    document.body.style.overflow = "hidden";
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timers: ReturnType<typeof setTimeout>[] = [];
    revealTimers.current = timers;
    if (reduced) {
      setSkip(true);
      setCurrentIndex(0);
      setPrinting(true);
    } else if (finalists.length === 1) {
      setPrinting(true);
    } else {
      const stepDuration = Math.min(550, 5500 / (finalists.length - 1));
      for (let step = 1; step < finalists.length; step++) {
        timers.push(
          setTimeout(() => {
            const index = finalists.length - 1 - step;
            setCurrentIndex(index);
            if (index === 0) setPrinting(true);
          }, step * stepDuration),
        );
      }
    }
    return () => {
      timers.forEach(clearTimeout);
      node.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, [finalists.length]);

  function skipToTicket() {
    revealTimers.current.forEach(clearTimeout);
    setCurrentIndex(0);
    setSkip(true);
    setPrinting(true);
  }
  return createPortal(
    <dialog
      ref={dialog}
      className={`${styles.dialog} ${GeistSans.className}`}
      aria-label="Kveldens film"
      onCancel={onClose}
    >
      <div className={styles.topbar}>
        <span>FILMKLUBBEN / DEMORUNDE</span>
        <button type="button" onClick={onClose} aria-label="Lukk annonseringen">
          Lukk ×
        </button>
      </div>
      <div className={styles.content}>
        <section
          className={styles.winner}
          aria-label={
            printing ? `Vinner: ${winner.film.title}` : "Resultatannonsering"
          }
        >
          <div className={styles.winnerHeading} key={currentResult.film.id}>
            <p className={styles.kicker}>
              {printing ? "VINNEREN ER" : `${currentIndex + 1}. PLASS`}
            </p>
            <h1>{currentResult.film.title}</h1>
            <p>
              {currentResult.votes}{" "}
              {currentResult.votes === 1 ? "eksempelstemme" : "eksempelstemmer"}{" "}
              · {currentResult.film.year}
            </p>
          </div>
          <TicketPrinter
            ticket={ticket}
            waiting={!printing}
            skipAnimation={skip}
            onComplete={() => setFinished(true)}
          />
          <div className={styles.actions} data-ready={finished}>
            <button className={styles.again} type="button" onClick={onClose}>
              Tilbake til filmene
            </button>
          </div>
          {!finished && (
            <button className={styles.skip} onClick={skipToTicket}>
              Hopp over animasjonen
            </button>
          )}
        </section>
        {finished && (
          <section
            className={styles.allResults}
            aria-label="Resultater for alle filmene"
          >
            <header className={styles.resultsHeader}>
              <h2>Hele avstemningen</h2>
              <span>Eksempelstemmer</span>
            </header>
            <ol className={styles.ranking}>
              {finalists.map((entry, index) => (
                <li
                  key={entry.film.id}
                  data-visible="true"
                  data-winner={index === 0}
                >
                  <span className={styles.place}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className={styles.filmTitle}>
                    {entry.film.title}
                    <small>{entry.film.year}</small>
                  </span>
                  <span className={styles.votes}>
                    <strong>{entry.votes}</strong>{" "}
                    {entry.votes === 1 ? "stemme" : "stemmer"}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
      <div className={styles.printOnly} aria-hidden="true">
        <FilmTicket ticket={ticket} />
      </div>
    </dialog>,
    document.body,
  );
}
