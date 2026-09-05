/* eslint-disable @next/next/no-img-element -- Print artwork uses native image sizing. */
import { useEffect, useRef, useState } from "react";
import { withBasePath } from "@/lib/basePath";
import styles from "@/styles/ticketDemo.module.css";

export interface TicketData {
  film: { id: number; title: string; year: number; coverImage: string };
  image: string;
  fallback: string;
  logo?: string;
  logoFallback?: string;
  director?: string;
  palette: string;
  date: string;
  time: string;
  venue: string;
  note: string;
  serial: string;
}
const localOrRemote = (url: string) =>
  url.startsWith("/") ? withBasePath(url) : url;

export function FilmTicket({
  ticket,
  onReady,
}: {
  ticket: TicketData;
  onReady?: () => void;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);
  const [imageAttempt, setImageAttempt] = useState(0);
  const [logoAttempt, setLogoAttempt] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const logoSources = [ticket.logo, ticket.logoFallback].filter(
    Boolean,
  ) as string[];
  const date = new Date(`${ticket.date}T12:00:00Z`);
  const day = Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("nb-NO", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
  const sources = [
    ticket.image,
    ticket.fallback,
    ticket.film.coverImage,
  ].filter(Boolean);
  // A cached image can finish before React hydrates and attaches onLoad.
  // Inspect the rendered images as well, including cached failures.
  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete) {
      if (image.naturalWidth > 0) setImageLoaded(true);
      else setImageAttempt(imageAttempt + 1);
    }
    const logo = logoRef.current;
    if (logo?.complete) {
      if (logo.naturalWidth > 0) setLogoLoaded(true);
      else setLogoAttempt(logoAttempt + 1);
    }
  }, [imageAttempt, logoAttempt]);
  const ready =
    (imageLoaded || imageAttempt >= sources.length) &&
    (logoLoaded || logoAttempt >= logoSources.length);
  useEffect(() => {
    if (ready) onReady?.();
  }, [ready, onReady]);
  return (
    <article
      className={styles.ticket}
      data-palette={ticket.palette}
      aria-label={`Filmbillett: ${ticket.film.title}, ${day} klokken ${ticket.time}`}
    >
      <div className={styles.artwork}>
        {imageAttempt < sources.length ? (
          <img
            ref={imageRef}
            className={styles.scene}
            src={localOrRemote(sources[imageAttempt]!)}
            alt=""
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageAttempt(imageAttempt + 1)}
          />
        ) : (
          <div className={styles.artFallback}>{ticket.film.year || "FILM"}</div>
        )}
      </div>
      <div className={styles.ticketBody}>
        <div className={styles.landscape}>
          <div className={styles.edition}>
            <span>
              {ticket.director
                ? `REGI: ${ticket.director}`
                : "FILMKLUBBEN PRESENTERER"}
            </span>
            <span>FILM / {ticket.film.year || "—"}</span>
          </div>
          <div
            className={styles.titleBlock}
            data-long={ticket.film.title.length > 26}
          >
            {ticket.logo && logoAttempt < logoSources.length ? (
              <img
                ref={logoRef}
                className={styles.titleLogo}
                src={localOrRemote(logoSources[logoAttempt]!)}
                alt={ticket.film.title}
                onLoad={() => setLogoLoaded(true)}
                onError={() => setLogoAttempt(logoAttempt + 1)}
              />
            ) : (
              <h2>{ticket.film.title}</h2>
            )}
          </div>
          <p className={styles.ticketNote}>{ticket.note}</p>
          <div className={styles.infoGrid}>
            <div>
              <span>DATO</span>
              <strong>{day}</strong>
            </div>
            <div>
              <span>TID</span>
              <strong>{ticket.time}</strong>
            </div>
            <div className={styles.venueCell}>
              <span>KINO</span>
              <strong>{ticket.venue}</strong>
            </div>
            <div className={styles.admit}>
              <span>GOD</span>
              <strong>FILM.</strong>
            </div>
          </div>
          <div className={styles.ticketFooter}>
            <span>BEHOLD BILLETTEN</span>
            <span>NR. {ticket.serial} / ÉN FILMKVELD</span>
          </div>
        </div>
      </div>
      <div
        className={styles.grain}
        style={{
          backgroundImage: `url("${withBasePath("/ticket-demo/paper-grain.png")}")`,
        }}
        aria-hidden="true"
      />
    </article>
  );
}
