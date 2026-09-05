/* eslint-disable @next/next/no-img-element -- Unmodified TMDB attribution logo. */
import Head from "next/head";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import catalogue from "@/data/filmVoteCatalogue.json";
import art from "@/data/ticketDemoArt.json";
import logos from "@/data/filmCassetteLogos.json";
import { FilmTicket, type TicketData } from "@/components/FilmTicket";
import { withBasePath } from "@/lib/basePath";
import styles from "@/styles/ticketDemo.module.css";

const samples = [
  { id: 62, label: "2001" },
  { id: 25538, label: "Yi Yi" },
  { id: 149, label: "Akira" },
  { id: 10227, label: "PlayTime" },
];
const palettes = [
  { id: "ember", label: "Krem" },
  { id: "rose", label: "Rosa" },
  { id: "red", label: "Rød" },
  { id: "mineral", label: "Grønn" },
];
const curated: Record<number, string> = {
  62: "ember",
  25538: "rose",
  149: "red",
  10227: "mineral",
};

export default function TicketDemo() {
  const [selectedId, setSelectedId] = useState(62);
  const [palette, setPalette] = useState("ember");
  const [originalLogo, setOriginalLogo] = useState(true);
  const [date, setDate] = useState("2026-09-22");
  const [time, setTime] = useState("16:00");
  const [venue, setVenue] = useState("Wergelandshallen");
  const [note, setNote] = useState("EN FILMKVELD SAMMEN.");
  const [readyTicketKey, setReadyTicketKey] = useState("");
  const [fontsReady, setFontsReady] = useState(false);
  const ticketKey = `${selectedId}-${originalLogo}`;
  const readyToPrint = fontsReady && readyTicketKey === ticketKey;
  useEffect(() => {
    let mounted = true;
    void document.fonts.ready.then(() => {
      if (mounted) setFontsReady(true);
    });
    return () => {
      mounted = false;
    };
  }, []);
  const ticketRef = useRef<HTMLDivElement>(null);
  const film = catalogue.find((f) => f.id === selectedId)!;
  const artwork = art[String(film.id) as keyof typeof art];
  const logo = logos[film.coverImage as keyof typeof logos];
  const ticket: TicketData = {
    film,
    ...artwork,
    palette,
    logo: originalLogo
      ? "logo" in artwork
        ? artwork.logo
        : logo?.image
      : undefined,
    logoFallback: originalLogo ? logo?.image : undefined,
    date,
    time,
    venue: venue.trim() || "Filmklubben",
    note,
    serial: String(catalogue.findIndex((f) => f.id === film.id) + 1).padStart(
      3,
      "0",
    ),
  };
  function chooseFilm(id: number) {
    if (id !== selectedId) setReadyTicketKey("");
    setSelectedId(id);
    setPalette(curated[id] ?? art[String(id) as keyof typeof art].palette);
  }
  function printTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Keep printing synchronous with the click. Readiness includes local
    // fallbacks, so navigating or editing never schedules a later print job.
    if (
      !readyToPrint ||
      Array.from(ticketRef.current?.querySelectorAll("img") ?? []).some(
        (img) => !img.complete || img.naturalWidth === 0,
      )
    )
      return;
    window.print();
  }
  return (
    <div className={styles.page}>
      <Head>
        <title>{film.title} · Filmbillett</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <header className={styles.header}>
        <Link href="/">
          Filmklubben <span>●</span>
        </Link>
        <span>BILLETTVERKSTED / DEMO</span>
      </header>
      <main className={styles.studio}>
        <div className={styles.controls}>
          <div className={styles.eyebrow}>ET LITE MINNE FRA KINOMØRKET</div>
          <h1>
            En film. <br />
            En billett.
          </h1>
          <p className={styles.intro}>
            Velg en film. Sett ditt preg på billetten. Ta den med hjem.
          </p>
          <div className={styles.sampleChoices} aria-label="Prøv en film">
            {samples.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                aria-pressed={selectedId === id}
                onClick={() => chooseFilm(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <form onSubmit={printTicket} aria-label="Lag en filmbillett">
            <label className={styles.field}>
              FILM
              <select
                value={selectedId}
                onChange={(e) => chooseFilm(Number(e.target.value))}
              >
                {catalogue.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title} ({f.year})
                  </option>
                ))}
              </select>
            </label>
            <fieldset className={styles.paletteField}>
              <legend>PAPIR OG TRYKK</legend>
              <div>
                {palettes.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    data-palette={p.id}
                    aria-label={p.label}
                    aria-pressed={palette === p.id}
                    onClick={() => setPalette(p.id)}
                  >
                    <span />
                    {p.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={originalLogo}
                onChange={(e) => {
                  setReadyTicketKey("");
                  setOriginalLogo(e.target.checked);
                }}
              />
              Bruk filmens originale tittellogo
            </label>
            <div className={styles.fields}>
              <label className={styles.field}>
                DATO
                <input
                  type="date"
                  value={date}
                  min="1900-01-01"
                  max="9999-12-31"
                  required
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label className={styles.field}>
                TID
                <input
                  type="time"
                  value={time}
                  required
                  onChange={(e) => setTime(e.target.value)}
                />
              </label>
            </div>
            <label className={styles.field}>
              VISNINGSSTED
              <input
                value={venue}
                maxLength={40}
                onChange={(e) => setVenue(e.target.value)}
              />
            </label>
            <label className={styles.field}>
              LINJE UNDER TITTELEN
              <input
                value={note}
                maxLength={70}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <button
              className={styles.primary}
              type="submit"
              disabled={!readyToPrint}
            >
              {readyToPrint
                ? "Skriv ut / lagre PDF"
                : "Laster motiv og tittel…"}
              <span aria-hidden="true">↗</span>
            </button>
            <p className={styles.hint}>
              Skriv ut på A4 med bakgrunner og uten topp- og bunntekst.
              Kontroller skalaen hvis billetten skal klippes til et bestemt mål.
            </p>
          </form>
          <details className={styles.credits}>
            <summary>Om demoen</summary>
            <p>
              Alt du endrer, skjer bare her i nettleseren. Filmene, motivene og
              tittellogoene er fra Filmklubbens eksisterende katalog. Ingen
              avstemning er koblet til.
            </p>
            <a href="https://www.themoviedb.org">
              <img
                src={withBasePath("/ticket-demo/tmdb.svg")}
                width="78"
                height="12"
                alt="TMDB"
              />
            </a>
            <p>
              This product uses the TMDB API but is not endorsed or certified by
              TMDB.
            </p>
          </details>
        </div>
        <section className={styles.preview} aria-label="Billettforhåndsvisning">
          <div className={styles.previewCaption}>
            <span>PRØVETRYKK / {ticket.serial}</span>
            <span>80 × 190 MM</span>
          </div>
          <div
            className={styles.ticketMount}
            ref={ticketRef}
            key={`${film.id}-${originalLogo}`}
          >
            <FilmTicket
              ticket={ticket}
              onReady={() => setReadyTicketKey(ticketKey)}
            />
          </div>
          <p className={styles.previewNote}>EN FILM ER BEST NÅR DEN DELES.</p>
        </section>
      </main>
    </div>
  );
}
