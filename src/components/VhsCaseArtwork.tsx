import { withBasePath } from "@/lib/basePath";
import styles from "@/styles/filmClubProgram.module.css";

/** Shared artwork: the demo exercises the same layers as the vote wall. */
export function VhsCaseArtwork({
  coverImage,
  eager = false,
}: {
  coverImage: string;
  eager?: boolean;
}) {
  return (
    <>
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
        <img
          src={withBasePath(coverImage)}
          alt=""
          draggable={false}
          loading={eager ? "eager" : "lazy"}
        />
      </span>
    </>
  );
}
