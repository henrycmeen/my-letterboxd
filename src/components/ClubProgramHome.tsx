import Head from "next/head";
import { useState } from "react";
import { FilmVoteWall, INITIAL_VOTE_LEADER } from "@/components/FilmVoteWall";
import { formatFilmDate } from "@/components/filmClubProgramData";
import { LeaderVhsPreview } from "@/components/LeaderVhsPreview";
import { NextFilmTv } from "@/components/NextFilmTv";
import { useClubNextMovie } from "@/components/useClubNextMovie";
import { getBoardIdFromClubSlug } from "@/lib/clubSlug";
import styles from "@/styles/filmClubProgram.module.css";

interface ClubProgramHomeProps {
  clubSlug: string;
}

export const ClubProgramHome = ({ clubSlug }: ClubProgramHomeProps) => {
  const nextMovie = useClubNextMovie(getBoardIdFromClubSlug(clubSlug));
  const [leader, setLeader] = useState(INITIAL_VOTE_LEADER);

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
            <span>{formatFilmDate(nextMovie.scheduledAt)}</span>
          </div>

          <div className={styles.nextLayout}>
            <LeaderVhsPreview key={leader.id} film={leader} />
            <div className={styles.nextCase}>
              <NextFilmTv movie={leader} />
            </div>
          </div>
        </section>

        <FilmVoteWall
          currentLeaderId={leader.id}
          onLeaderChange={setLeader}
        />
      </main>
    </>
  );
};
