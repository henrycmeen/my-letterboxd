import { RatedMovie, DiaryEntry } from '../movies';

const parseCSVLine = (line: string): string[] => {
  const fields = line.split(',').map(field => field.trim());
  return fields.map(field => field || ''); // Replace undefined with empty string
};

export const parseRatings = (content: string): RatedMovie[] => {
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

export const parseDiary = (content: string): DiaryEntry[] => {
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

export const parseCSVContent = (content: string, includeRewatch: boolean = false): any[] => {
  const lines = content.split('\n').filter(line => line.trim());
  
  return lines.slice(1).map(line => {
    const [date, name, year, uri, rating, rewatch, tags, watchedDate] = parseCSVLine(line);
    const baseMovie = {
      title: name || '',
      year: parseInt(year || '0'),
      letterboxdUri: uri || '',
      rating: parseFloat(rating || '0'),
      ratingDate: date || ''
    };

    if (includeRewatch) {
      return {
        ...baseMovie,
        rewatch: (rewatch || '').toLowerCase() === 'yes',
        tags: tags ? tags.split(' ') : [],
        watchedDate: watchedDate || ''
      };
    }

    return baseMovie;
  });
};