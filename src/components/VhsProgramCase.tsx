import { useState } from "react";
import type { FilmProgramMovie } from "@/components/filmClubProgramData";
import { withBasePath } from "@/lib/basePath";
import styles from "@/styles/filmClubProgram.module.css";

interface VhsProgramCaseProps {
  movie: FilmProgramMovie;
  size?: "hero" | "archive" | "poll";
}

const resolveImagePath = (value: string): string =>
  value.startsWith("/") ? withBasePath(value) : value;

export const VhsProgramCase = ({
  movie,
  size = "archive",
}: VhsProgramCaseProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <button
      className={styles.vhsCase}
      data-size={size}
      type="button"
      aria-label={`${isOpen ? "Lukk" : "Åpne"} VHS-etuiet for ${movie.title}`}
      aria-pressed={isOpen}
      onClick={() => setIsOpen((current) => !current)}
    >
      <span className={styles.vhsInterior} aria-hidden="true">
        {/* This is a resized copy of the original black-case raster. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={styles.vhsShell}
          src={withBasePath("/VHS/program/case-underlay.avif")}
          alt=""
          draggable={false}
        />
        {/* The cassette is an optimized copy of Filmklubben's original raster asset. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={styles.vhsCassette}
          src={withBasePath("/VHS/program/cassette.avif")}
          alt=""
          draggable={false}
        />
      </span>
      <span className={styles.vhsCover} aria-hidden="true">
        {/* Covers are rendered with the project's existing VHS compositor. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={resolveImagePath(movie.coverImage)}
          alt=""
          draggable={false}
        />
      </span>
    </button>
  );
};
