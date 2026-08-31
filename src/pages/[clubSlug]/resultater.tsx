import type { NextPage } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import { FilmClubResults } from "@/components/FilmClubResults";
import { resolveClubSlugParam } from "@/lib/clubSlug";

const ClubResultsPage: NextPage = () => {
  const router = useRouter();

  if (!router.isReady) {
    return null;
  }

  const clubSlug = resolveClubSlugParam(router.query.clubSlug);

  return (
    <>
      <Head>
        <title>Resultater · Filmklubben</title>
        <meta
          name="description"
          content="Løpende stilling og tidligere vinnere i Filmklubben."
        />
      </Head>
      <FilmClubResults clubSlug={clubSlug} />
    </>
  );
};

export default ClubResultsPage;
