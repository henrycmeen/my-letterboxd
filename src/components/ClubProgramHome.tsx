import Head from "next/head";
import { useEffect, useState } from "react";
import { FilmVoteWall, type FilmVoteMovie } from "@/components/FilmVoteWall";
import { formatFilmDate } from "@/components/filmClubProgramData";
import { NextFilmTv } from "@/components/NextFilmTv";
import {
  getActiveVoteBoardId,
  getFilmClubProgramme,
} from "@/lib/filmClubProgramme";
import styles from "@/styles/filmClubProgram.module.css";

interface ClubProgramHomeProps {
  clubSlug: string;
}

export const ClubProgramHome = ({ clubSlug }: ClubProgramHomeProps) => {
  const boardId = getActiveVoteBoardId(clubSlug);
  const programme = getFilmClubProgramme(clubSlug);
  const [leader, setLeader] = useState<FilmVoteMovie | null>(null);

  useEffect(() => {
    setLeader(null);
  }, [boardId]);

  return (
    <>
      <Head>
        <title>Filmklubben</title>
        <meta
          name="description"
          content="Neste film, tidligere visninger og avstemning i Filmklubben."
        />
      </Head>

      <main className={styles.programPage}>
        <section className={styles.nextSection} id="neste">
          <div className={styles.sectionLabel}>
            <span>Neste film</span>
            <span>{formatFilmDate(programme.activeScreening.scheduledAt)}</span>
          </div>

          <div className={styles.nextLayout}>
            <div className={styles.nextCase}>
              <NextFilmTv movie={leader} />
            </div>
          </div>
        </section>

        <FilmVoteWall
          key={boardId}
          boardId={boardId}
          onLeaderChange={setLeader}
        />
      </main>
    </>
  );
};
