import type { FilmVoteMovie } from "@/components/FilmVoteWall";
import { withBasePath } from "@/lib/basePath";
import styles from "@/styles/filmClubProgram.module.css";

interface LeaderVhsPreviewProps {
  film: FilmVoteMovie;
}

export const LeaderVhsPreview = ({ film }: LeaderVhsPreviewProps) => (
  <div
    className={styles.leaderPreview}
    role="img"
    aria-label={`${film.title} leder avstemningen`}
  >
    <span className={styles.voteCaseInterior} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={styles.voteCaseShell}
        src={withBasePath("/VHS/program/case-underlay-trimmed.avif")}
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
      <img src={withBasePath(film.coverImage)} alt="" draggable={false} />
    </span>
  </div>
);
