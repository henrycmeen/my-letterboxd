import { promises as fs } from 'fs';
import path from 'path';
import { NextApiRequest, NextApiResponse } from 'next';
import { RatedMovie, DiaryEntry } from '@/data/movies';

const CSV_FOLDER = path.join(process.cwd(), 'src/data/Account Settings Feb 3 2025');

const parseCSVLine = (line: string): string[] => {
  const fields = line.split(',').map(field => field.trim());
  return fields.map(field => field || '');
};

const parseRatings = async (): Promise<RatedMovie[]> => {
  const content = await fs.readFile(path.join(CSV_FOLDER, 'ratings.csv'), 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  
  return lines.slice(1).map(line => {
    const [date, name, year, uri, rating] = parseCSVLine(line);
    return {
      title: name || '',
      year: parseInt(year || '0'),
      letterboxdUri: uri || '',
      rating: parseFloat(rating || '0'),
      ratingDate: date || ''
    };
  });
};

const parseDiary = async (): Promise<DiaryEntry[]> => {
  const content = await fs.readFile(path.join(CSV_FOLDER, 'diary.csv'), 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  
  return lines.slice(1).map(line => {
    const [date, name, year, uri, rating, rewatch, tags, watchedDate] = parseCSVLine(line);
    return {
      title: name || '',
      year: parseInt(year || '0'),
      letterboxdUri: uri || '',
      rating: parseFloat(rating || '0'),
      ratingDate: date || '',
      rewatch: (rewatch || '').toLowerCase() === 'yes',
      tags: tags ? tags.split(' ') : [],
      watchedDate: watchedDate || ''
    };
  });
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const [ratings, diary] = await Promise.all([parseRatings(), parseDiary()]);
    res.status(200).json({ ratings, diary });
  } catch (error) {
    console.error('Error loading movie data:', error);
    res.status(500).json({ message: 'Error loading movie data' });
  }
}