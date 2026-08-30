import { useMemo, useRef, useState } from "react";
import filmVoteCatalogue from "@/data/filmVoteCatalogue.json";
import { withBasePath } from "@/lib/basePath";
import { applyRankedFilmVote, type RankedFilmPollCount } from "@/lib/filmPoll";
import styles from "@/styles/filmClubProgram.module.css";

const FILM_BY_ID = new Map(
  filmVoteCatalogue.map((film) => [String(film.id), film]),
);

export type FilmVoteMovie = (typeof filmVoteCatalogue)[number];
export const INITIAL_VOTE_LEADER = filmVoteCatalogue[0]!;

interface FilmVoteWallProps {
  onLeaderChange?: (film: FilmVoteMovie) => void;
}

const createInitialCounts = (): RankedFilmPollCount[] =>
  filmVoteCatalogue.map((film, index) => ({
    id: String(film.id),
    votes: 0,
    initialRank: index,
    lastVoteOrder: 0,
  }));

export const FilmVoteWall = ({ onLeaderChange }: FilmVoteWallProps) => {
  const [counts, setCounts] =
    useState<RankedFilmPollCount[]>(createInitialCounts);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastVotedTitle, setLastVotedTitle] = useState<string | null>(null);
  const voteOrder = useRef(0);

  const rankedFilms = useMemo(
    () =>
      counts.flatMap((count) => {
        const film = FILM_BY_ID.get(count.id);
        return film ? [{ count, film }] : [];
      }),
    [counts],
  );

  const voteForFilm = (id: string, title: string) => {
    if (id === selectedId) {
      return;
    }

    voteOrder.current += 1;
    setCounts((current) =>
      applyRankedFilmVote(current, selectedId, id, voteOrder.current),
    );
    setSelectedId(id);
    setLastVotedTitle(title);
    const nextLeader = FILM_BY_ID.get(id);
    if (nextLeader) {
      onLeaderChange?.(nextLeader);
    }
  };

  return (
    <section className={styles.voteWallSection} id="stem">
      <p className={styles.screenReaderStatus} role="status" aria-live="polite">
        {lastVotedTitle
          ? `${lastVotedTitle} har stemmen din og ligger øverst.`
          : `${filmVoteCatalogue.length} filmer å stemme på.`}
      </p>

      <ol className={styles.voteGrid} aria-label="Filmer du kan stemme på">
        {rankedFilms.map(({ count, film }, index) => {
          const isSelected = selectedId === count.id;
          const rank = index + 1;

          return (
            <li key={film.id}>
              <button
                className={styles.voteFilm}
                type="button"
                title={film.title}
                aria-label={`Stem på ${film.title}. Plass ${rank}, ${count.votes} stemmer.`}
                aria-pressed={isSelected}
                data-leader={rank === 1}
                onClick={() => voteForFilm(count.id, film.title)}
              >
                <span className={styles.voteCaseInterior} aria-hidden="true">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className={styles.voteCaseShell}
                    src={withBasePath(
                      "/VHS/program/case-underlay-trimmed.avif",
                    )}
                    alt=""
                    draggable={false}
                  />
                  <span className={styles.voteCassetteTray}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className={styles.voteCassette}
                      src={withBasePath("/VHS/program/cassette-trimmed.avif")}
                      alt=""
                      draggable={false}
                    />
                  </span>
                </span>
                <span className={styles.voteCaseCover} aria-hidden="true">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={withBasePath(film.coverImage)}
                    alt=""
                    draggable={false}
                    loading={index < 30 ? "eager" : "lazy"}
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
