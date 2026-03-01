import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import {
  BoardConflictError,
  clearBoard,
  getBoardState,
  replaceBoardMovies,
  type BoardMovie,
  type BoardState,
} from '@/lib/floorBoard';

type ApiResponse = BoardState | { message: string; issues?: unknown };

const getQueryValue = (
  value: string | string[] | undefined
): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
};

const boardPayloadSchema = z.object({
  boardId: z.string().trim().min(1).max(64).optional(),
  expectedVersion: z.number().int().nonnegative().optional(),
  movies: z.array(
    z.object({
      id: z.number().int().positive(),
      title: z.string().trim().min(1),
      coverImage: z.string().trim().min(1),
      x: z.number(),
      y: z.number(),
      rotation: z.number(),
      score: z.number().min(0).max(100).optional(),
    })
  ).default([]),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  if (req.method !== 'GET' && req.method !== 'PUT' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'GET, PUT, DELETE');
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const boardId = getQueryValue(req.query.boardId) ?? 'default';

  try {
    if (req.method === 'GET') {
      const board = await getBoardState(boardId);
      return res.status(200).json(board);
    }

    if (req.method === 'DELETE') {
      const board = await clearBoard(boardId);
      return res.status(200).json(board);
    }

    const payloadResult = boardPayloadSchema.safeParse(req.body ?? {});
    if (!payloadResult.success) {
      return res.status(400).json({
        message: 'Invalid request body.',
        issues: payloadResult.error.issues,
      });
    }

    const { boardId: requestedBoardId, expectedVersion, movies } =
      payloadResult.data;
    const normalizedBoardId = requestedBoardId?.trim() ?? boardId;

    const parsedMovies = movies as BoardMovie[];
    const nextBoard = await replaceBoardMovies({
      boardId: normalizedBoardId,
      expectedVersion,
      movies: parsedMovies,
    });

    return res.status(200).json(nextBoard);
  } catch (error) {
    if (error instanceof BoardConflictError) {
      return res.status(409).json({
        message: error.message,
      });
    }

    const message =
      error instanceof Error ? error.message : 'Unexpected floor board error.';

    return res.status(500).json({ message });
  }
}
