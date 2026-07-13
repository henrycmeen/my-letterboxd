import { type NextPage } from 'next';
import { useRouter } from 'next/router';
import { resolveClubSlugParam } from '@/lib/clubSlug';
import { FloorScreen } from '@/pages/floor';

const ClubFilmvelgerPage: NextPage = () => {
  const router = useRouter();

  if (!router.isReady) {
    return null;
  }

  const clubSlug = resolveClubSlugParam(router.query.clubSlug);
  return <FloorScreen key={clubSlug} clubSlug={clubSlug} />;
};

export default ClubFilmvelgerPage;
