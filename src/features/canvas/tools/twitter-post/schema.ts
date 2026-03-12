import { z } from "zod";

const TwitterAuthorSchema = z.object({
  name: z.string(),
  handle: z.string(),
  avatar: z.string().optional(),
});

const TwitterMediaItemSchema = z.object({
  url: z.string(),
  type: z.enum(["image"]),
});

const TwitterPostSchema = z.object({
  text: z.string(),
  /** @deprecated Use `media` instead. Kept for backward compatibility. */
  image: z.string().optional(),
  /** Multi-image attachments. */
  media: z.array(TwitterMediaItemSchema).optional(),
  likes: z.number().optional(),
  retweets: z.number().optional(),
  replies: z.number().optional(),
  timestamp: z.string().optional(),
});

export const TwitterPostToolDataSchema = z.object({
  author: TwitterAuthorSchema,
  posts: z.array(TwitterPostSchema).min(1),
});

export type TwitterPostToolData = z.infer<typeof TwitterPostToolDataSchema>;
export type TwitterAuthor = z.infer<typeof TwitterAuthorSchema>;
export type TwitterPost = z.infer<typeof TwitterPostSchema>;
export type TwitterMediaItem = z.infer<typeof TwitterMediaItemSchema>;
