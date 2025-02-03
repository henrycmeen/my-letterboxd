import { type NextPage } from 'next';
import VHSCoverflow from '../components/VHSCoverflow';

const movies = [
  {
    title: 'Burning',
    coverImage: '/VHS/Front Side Cover Burning.png',
  },
  {
    title: 'The Lighthouse',
    coverImage: '/VHS/Front Side Cover Lighthouse.png',
  },
  {
    title: 'Perfect Days',
    coverImage: '/VHS/Front Side Cover_perfect.png',
  },
  {
    title: 'Seven',
    coverImage: '/VHS/Front Side Cover_seven.png',
  },
];

const Home: NextPage = () => {
  return (
    <main>
      <VHSCoverflow movies={movies} />
    </main>
  );
};

export default Home;