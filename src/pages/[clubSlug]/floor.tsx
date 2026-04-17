import { type NextPage } from 'next';
import { useRouter } from 'next/router';
import { resolveClubSlugParam } from '@/lib/clubSlug';
import { FloorScreen } from '@/pages/floor';

const ClubFloorPage: NextPage = () => {
  const router = useRouter();

  if (!router.isReady) {
    return null;
  }

  return <FloorScreen clubSlug={resolveClubSlugParam(router.query.clubSlug)} />;
};

export default ClubFloorPage;
