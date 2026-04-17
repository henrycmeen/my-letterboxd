import { type NextPage } from 'next';
import { useRouter } from 'next/router';
import { resolveClubSlugParam } from '@/lib/clubSlug';
import { HomeScreen } from '@/pages/index';

const ClubHomePage: NextPage = () => {
  const router = useRouter();

  if (!router.isReady) {
    return null;
  }

  return <HomeScreen clubSlug={resolveClubSlugParam(router.query.clubSlug)} />;
};

export default ClubHomePage;
