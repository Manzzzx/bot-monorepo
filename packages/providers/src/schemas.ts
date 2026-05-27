import { z } from 'zod';

export const DownloaderResultSchema = z.object({
  type: z.enum(['video', 'audio', 'image', 'document']),
  url: z.string().url(),
  title: z.string().optional(),
  author: z.string().optional(),
  caption: z.string().optional(),
  durationSec: z.number().optional(),
  thumbnailUrl: z.string().url().optional(),
  sizeBytes: z.number().optional(),
});

export const StalkerResultSchema = z.object({
  username: z.string().min(1),
  displayName: z.string().optional(),
  bio: z.string().optional(),
  avatarUrl: z.string().url().optional(),
  verified: z.boolean().optional(),
  private: z.boolean().optional(),
  followers: z.number().optional(),
  following: z.number().optional(),
  posts: z.number().optional(),
  url: z.string().url().optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
});