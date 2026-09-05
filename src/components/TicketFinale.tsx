import Link from "next/link";
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
  const [revealed, setRevealed] = useState(0);
  const [printing, setPrinting] = useState(false);
  const [finished, setFinished] = useState(false);
  const [skip, setSkip] = useState(false);
  const [assetsReady, setAssetsReady] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const winner = finalists[0]!;
  const [ticket] = useState(() => makeFilmTicket(winner.film, "001"));
  const ascending = [...finalists].reverse();

  useEffect(() => {
    const node = dialog.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    node.showModal();
    let active = true;
    void document.fonts.ready.then(() => {
      if (active) setFontsReady(true);
    });
    document.body.style.overflow = "hidden";
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (reduced) {
      setSkip(true);
      setPrinting(true);
    } else {
      ascending.forEach((_, index) => {
        timers.push(
          setTimeout(() => setRevealed(index + 1), 600 + index * 620),
        );
      });
      timers.push(
        setTimeout(() => setPrinting(true), 600 + ascending.length * 620 + 900),
      );
    }
    return () => {
      active = false;
      timers.forEach(clearTimeout);
      node.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
    // The finalists are a captured demo result, fixed for this mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function skipToTicket() {
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
        {!printing ? (
          <section className={styles.results} aria-label="Eksempelresultater">
            <p className={styles.kicker}>STEMMENE ER TELT.</p>
            <h1>Og kveldens film er …</h1>
            <ol className={styles.ranking} aria-live="off">
              {ascending.map((entry, index) => (
                <li
                  key={entry.film.id}
                  data-visible={index < revealed}
                  data-winner={index === ascending.length - 1}
                >
                  <span className={styles.place}>
                    {String(ascending.length - index).padStart(2, "0")}
                  </span>
                  <span className={styles.filmTitle}>
                    {entry.film.title}
                    <small>{entry.film.year}</small>
                  </span>
                  <span className={styles.votes}>
                    <strong>{entry.votes}</strong> stemmer
                  </span>
                </li>
              ))}
            </ol>
            <p className={styles.demoNote}>
              Eksempelstemmer · Filmrekkefølgen følger valgene dine i demoen.
            </p>
            <button className={styles.skip} onClick={skipToTicket}>
              Hopp til billetten ↓
            </button>
          </section>
        ) : (
          <section
            className={styles.winner}
            aria-label={`Vinner: ${winner.film.title}`}
          >
            <div className={styles.winnerHeading}>
              <p className={styles.kicker}>KVELDENS FILM</p>
              <h1>{winner.film.title}</h1>
              <p>
                {winner.votes} eksempelstemmer · {winner.film.year}
              </p>
            </div>
            <TicketPrinter
              ticket={ticket}
              skipAnimation={skip}
              onComplete={() => setFinished(true)}
            />
            <div className={styles.actions} data-ready={finished}>
              <button
                type="button"
                onClick={() => window.print()}
                disabled={!finished || !assetsReady || !fontsReady}
              >
                Skriv ut / lagre PDF ↗
              </button>
              <Link href="/billett">Lag din egen billett ↗</Link>
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
        )}
      </div>
      <div className={styles.printOnly} aria-hidden="true">
        <FilmTicket ticket={ticket} onReady={() => setAssetsReady(true)} />
      </div>
    </dialog>,
    document.body,
  );
}
