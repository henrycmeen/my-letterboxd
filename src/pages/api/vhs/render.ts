import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { renderVhsPoster } from '@/lib/vhs/render';

const overlaySchema = z.object({
  publicPath: z.string().min(1),
  blend: z
    .enum([
      'over',
      'dest-in',
      'multiply',
      'screen',
      'overlay',
      'soft-light',
      'hard-light',
    ])
    .optional(),
  opacity: z.number().min(0).max(1).optional(),
  left: z.number().int().min(0).optional(),
  top: z.number().int().min(0).optional(),
  width: z.number().int().min(1).optional(),
  height: z.number().int().min(1).optional(),
});

const renderRequestSchema = z
  .object({
    sourceUrl: z.string().url().optional(),
    sourcePath: z.string().min(1).optional(),
    templateId: z.string().min(1).optional(),
    fit: z.enum(['cover', 'contain']).optional(),
    width: z.number().int().min(320).max(4096).optional(),
    height: z.number().int().min(320).max(4096).optional(),
    overlays: z.array(overlaySchema).optional(),
    format: z.enum(['png', 'webp']).optional(),
    quality: z.number().int().min(1).max(100).optional(),
    background: z.string().min(1).optional(),
    randomSeed: z.string().trim().min(1).max(128).optional(),
  })
  .refine((body) => !!body.sourceUrl || !!body.sourcePath, {
    message: 'sourceUrl or sourcePath is required.',
  });

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const parsedBody = renderRequestSchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({
      message: 'Invalid render payload.',
      issues: parsedBody.error.issues,
    });
  }

  try {
    const renderResult = await renderVhsPoster(parsedBody.data);
    res.setHeader('Content-Type', renderResult.contentType);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(renderResult.buffer);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected render error';
    return res.status(500).json({ message });
  }
}
