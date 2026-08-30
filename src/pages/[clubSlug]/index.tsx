import { type NextPage } from "next";
import { useRouter } from "next/router";
import { ClubProgramHome } from "@/components/ClubProgramHome";
import { resolveClubSlugParam } from "@/lib/clubSlug";

const ClubHomePage: NextPage = () => {
  const router = useRouter();

  if (!router.isReady) {
    return null;
  }

  return (
    <ClubProgramHome clubSlug={resolveClubSlugParam(router.query.clubSlug)} />
  );
};

export default ClubHomePage;
