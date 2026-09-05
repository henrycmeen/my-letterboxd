import Head from "next/head";
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getFlipMotion, type SlotPosition } from "@/lib/filmVoteClient";
import { NextFilmTv } from "@/components/NextFilmTv";
import { VhsCaseArtwork } from "@/components/VhsCaseArtwork";
import catalogue from "@/data/filmVoteCatalogue.json";
import styles from "@/styles/filmClubProgram.module.css";
import demo from "@/styles/filmClubDemo.module.css";

// Local preview only: never mount the real vote wall or write a club vote.
export const FilmClubDemo = () => {
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [suppressedId, setSuppressedId] = useState<number | null>(null);
  const rankedFilms = useMemo(
    () =>
      [...catalogue].sort((a, b) => {
        const voteDifference =
          Number(selected.has(b.id)) - Number(selected.has(a.id));
        return (
          voteDifference ||
          (selected.has(a.id) ? b.tmdbVoteAverage - a.tmdbVoteAverage : 0)
        );
      }),
    [selected],
  );
  const movie = rankedFilms[0]!;
  const itemNodes = useRef(new Map<number, HTMLLIElement>());
  const previousSlots = useRef(new Map<number, SlotPosition>());
  const previousRanks = useRef(new Map<number, number>());
  const runningAnimations = useRef(new Map<number, Animation>());

  useEffect(() => {
    const animations = runningAnimations.current;
    return () => {
      for (const animation of animations.values()) animation.cancel();
    };
  }, []);

  useLayoutEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    // Cancel all old transforms before measuring the newly sorted layout.
    for (const animation of runningAnimations.current.values())
      animation.cancel();
    runningAnimations.current.clear();
    rankedFilms.forEach((film, rank) => {
      const node = itemNodes.current.get(film.id);
      if (!node) return;
      delete node.dataset.moving;
      const previous = previousSlots.current.get(film.id);
      if (!previous || reducedMotion) return;
      const rect = node.getBoundingClientRect();
      const motion = getFlipMotion(
        previous,
        rect,
        (previousRanks.current.get(film.id) ?? rank) - rank,
      );
      if (!motion) return;
      node.dataset.moving = "true";
      const animation = node.animate(
        [
          {
            offset: 0,
            transform: `translate3d(${motion.from.x}px, ${motion.from.y}px, 0) scale(0.985)`,
          },
          {
            offset: 0.78,
            transform: `translate3d(${motion.from.x * -0.025}px, ${motion.from.y * -0.025}px, 0) scale(1.012)`,
          },
          { offset: 1, transform: "translate3d(0, 0, 0) scale(1)" },
        ],
        {
          delay: motion.delayMs,
          duration: motion.durationMs,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "backwards",
        },
      );
      runningAnimations.current.set(film.id, animation);
      animation.addEventListener(
        "finish",
        () => {
          delete node.dataset.moving;
          runningAnimations.current.delete(film.id);
        },
        { once: true },
      );
    });
    previousSlots.current.clear();
    previousRanks.current.clear();
  }, [rankedFilms]);

  return (
    <div className={styles.programPage}>
      <Head>
        <title>Filmklubben · demo</title>
        <meta
          name="description"
          content="Prøv Filmklubben: VHS-covere, filmvalg og trailere. En demo uten innlogging."
        />
      </Head>
      <main>
        <section
          className={styles.nextSection}
          aria-label="Trailer for ditt filmvalg"
        >
          <header className={`${styles.sectionLabel} ${demo.header}`}>
            <span>Filmklubben – finn neste film sammen.</span>
            <a href="https://github.com/henrycmeen/my-letterboxd">
              Koden på GitHub ↗
            </a>
          </header>
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
            {rankedFilms.map((film, index) => (
              <li
                key={film.id}
                ref={(node) => {
                  if (node) itemNodes.current.set(film.id, node);
                  else itemNodes.current.delete(film.id);
                }}
              >
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
                    previousSlots.current = new Map(
                      Array.from(itemNodes.current, ([id, node]) => {
                        const { left, top } = node.getBoundingClientRect();
                        return [id, { left, top }];
                      }),
                    );
                    previousRanks.current = new Map(
                      rankedFilms.map((item, rank) => [item.id, rank]),
                    );
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
        <Link href="/inngang" className={`${styles.sectionLabel} ${demo.clubCodeLink}`}>
          Har du en filmklubbkode? <span aria-hidden="true">↗</span>
        </Link>
      </footer>
    </div>
  );
};
