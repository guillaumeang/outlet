"use client";

import { useState, useCallback, useRef } from "react";
import { Check, Heart, ImagePlus, MessageCircle, Pencil, Plus, Repeat2, Send, Trash2, X as XIcon } from "lucide-react";
import type { ToolComponentProps } from "../types";
import type { TwitterPostToolData, TwitterPost, TwitterMediaItem } from "./schema";
import { uploadFile, toMediaUrl, ALLOWED_TWEET_MEDIA_TYPES, MAX_MEDIA_PER_TWEET } from "@/lib/upload";

type Props = ToolComponentProps<TwitterPostToolData>;

// ─── X / Twitter logo (inline SVG — no external dependency) ──────────────────

const XLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatCount = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

/** Normalize legacy `image` field to the new `media` array. */
function getPostMedia(post: TwitterPost): TwitterMediaItem[] {
  if (post.media && post.media.length > 0) return post.media;
  if (post.image) return [{ url: post.image, type: "image" as const }];
  return [];
}

/** Build a summary prompt describing the current tweet(s) state. */
function buildSavePrompt(posts: TwitterPost[], isThread: boolean): string {
  const lines: string[] = [`Update the ${isThread ? "thread" : "tweet"} to reflect my edits:`];
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    const media = getPostMedia(p);
    lines.push(`Tweet ${i + 1}: "${p.text}"`);
    if (media.length > 0) {
      lines.push(`  Images: ${media.map((m) => m.url).join(", ")}`);
    }
  }
  return lines.join("\n");
}

// ─── Pending upload type ─────────────────────────────────────────────────────

type PendingMedia = {
  id: string;
  previewUrl: string;
  uploading: boolean;
};

let pendingCounter = 0;
function nextPendingId(): string {
  return `pm-${Date.now()}-${++pendingCounter}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const TwitterPostTool = ({ data, onLocalEdit, onSendPrompt }: Props) => {
  const { author, posts } = data;
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [pendingByPost, setPendingByPost] = useState<Map<number, PendingMedia[]>>(new Map());
  const [isDirty, setIsDirty] = useState(false);

  // Keep a ref to the latest posts so async upload callbacks can read current state
  const postsRef = useRef(posts);
  postsRef.current = posts;

  // Per-post file input refs
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  // ── Wrapped onLocalEdit that also marks dirty ──

  const editAndMarkDirty = useCallback(
    (patch: Partial<TwitterPostToolData>) => {
      onLocalEdit(patch);
      setIsDirty(true);
    },
    [onLocalEdit],
  );

  // ── Text editing ──

  const handleTextChange = useCallback(
    (index: number, newText: string) => {
      const updatedPosts = posts.map((p, i) => (i === index ? { ...p, text: newText } : p));
      editAndMarkDirty({ posts: updatedPosts } as Partial<TwitterPostToolData>);
    },
    [posts, editAndMarkDirty],
  );

  // ── Media management ──

  const handleAddMedia = useCallback(
    (postIndex: number, files: File[]) => {
      const post = posts[postIndex];
      if (!post) return;
      const currentMedia = getPostMedia(post);
      const pendingForPost = pendingByPost.get(postIndex) ?? [];
      let totalSlots = currentMedia.length + pendingForPost.length;

      for (const file of files) {
        if (totalSlots >= MAX_MEDIA_PER_TWEET) break;
        if (!ALLOWED_TWEET_MEDIA_TYPES.has(file.type)) continue;

        const id = nextPendingId();
        const previewUrl = URL.createObjectURL(file);
        const pending: PendingMedia = { id, previewUrl, uploading: true };
        totalSlots++;

        // Add to pending state
        setPendingByPost((prev) => {
          const updated = new Map(prev);
          const list = [...(updated.get(postIndex) ?? []), pending];
          updated.set(postIndex, list);
          return updated;
        });

        // Upload in background
        uploadFile(file)
          .then((ref) => {
            const gatewayUrl = toMediaUrl(ref.path);
            // Remove from pending
            setPendingByPost((prev) => {
              const updated = new Map(prev);
              const list = (updated.get(postIndex) ?? []).filter((p) => p.id !== id);
              if (list.length === 0) updated.delete(postIndex);
              else updated.set(postIndex, list);
              return updated;
            });
            // Commit to media array — read latest posts via ref
            const currentPosts = postsRef.current;
            const updatedPosts = currentPosts.map((p, i) => {
              if (i !== postIndex) return p;
              const existing = getPostMedia(p);
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { image: _removed, ...rest } = p;
              return { ...rest, media: [...existing, { url: gatewayUrl, type: "image" as const }] };
            });
            editAndMarkDirty({ posts: updatedPosts } as Partial<TwitterPostToolData>);
            URL.revokeObjectURL(previewUrl);
          })
          .catch((err) => {
            console.error("[twitter-post] upload failed:", err);
            setPendingByPost((prev) => {
              const updated = new Map(prev);
              const list = (updated.get(postIndex) ?? []).filter((p) => p.id !== id);
              if (list.length === 0) updated.delete(postIndex);
              else updated.set(postIndex, list);
              return updated;
            });
            URL.revokeObjectURL(previewUrl);
          });
      }
    },
    [posts, pendingByPost, editAndMarkDirty],
  );

  const handleRemoveMedia = useCallback(
    (postIndex: number, mediaIndex: number) => {
      const updatedPosts = posts.map((p, i) => {
        if (i !== postIndex) return p;
        const currentMedia = getPostMedia(p);
        const newMedia = currentMedia.filter((_, mi) => mi !== mediaIndex);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { image: _removed, ...rest } = p;
        return { ...rest, media: newMedia };
      });
      editAndMarkDirty({ posts: updatedPosts } as Partial<TwitterPostToolData>);
    },
    [posts, editAndMarkDirty],
  );

  const handleRemovePost = useCallback(
    (index: number) => {
      if (posts.length <= 1) return;
      const updatedPosts = posts.filter((_, i) => i !== index);
      editAndMarkDirty({ posts: updatedPosts } as Partial<TwitterPostToolData>);
    },
    [posts, editAndMarkDirty],
  );

  // ── Save ──

  const hasPendingUploads = Array.from(pendingByPost.values()).some((list) => list.length > 0);

  const handleSave = useCallback(() => {
    const prompt = buildSavePrompt(posts, posts.length > 1);
    onSendPrompt(prompt);
    setIsDirty(false);
  }, [posts, onSendPrompt]);

  // ── Drag & drop ──

  const handleCardDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  }, []);

  const handleCardDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOverIndex(null);
  }, []);

  const handleCardDrop = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      setDragOverIndex(null);
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        ALLOWED_TWEET_MEDIA_TYPES.has(f.type),
      );
      if (files.length > 0) handleAddMedia(index, files);
    },
    [handleAddMedia],
  );

  const isThread = posts.length > 1;

  return (
    <div className="flex h-full flex-col overflow-auto bg-background">
      {/* ── Action bar ── */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        {/* Left: Save + status */}
        <button
          type="button"
          className="ui-btn-primary !min-h-0 h-7 gap-1.5 px-3 font-mono text-[10px] disabled:cursor-not-allowed disabled:opacity-40"
          onClick={handleSave}
          disabled={!isDirty || hasPendingUploads}
          title={hasPendingUploads ? "Waiting for uploads…" : isDirty ? "Save changes" : "No changes to save"}
        >
          <Check className="h-3 w-3" />
          Save
        </button>
        {isDirty ? (
          <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
            <Pencil className="h-2.5 w-2.5" />
            Draft
          </span>
        ) : (
          <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground/50">
            <Check className="h-2.5 w-2.5" />
            Saved
          </span>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right: Post + Add to thread */}
        <button
          type="button"
          className="ui-btn-primary !min-h-0 h-7 gap-1.5 px-3 font-mono text-[10px]"
          onClick={() => {
            const summary = posts.map((p, i) => `Tweet ${i + 1}: "${p.text}"`).join("; ");
            onSendPrompt(`Post this ${isThread ? "thread" : "tweet"}: ${summary}`);
          }}
        >
          <Send className="h-3 w-3" />
          {isThread ? "Post thread" : "Post"}
        </button>
        <button
          type="button"
          className="ui-btn-secondary !min-h-0 h-7 gap-1.5 px-3 font-mono text-[10px]"
          onClick={() => onSendPrompt("Add another tweet to this thread")}
        >
          <Plus className="h-3 w-3" />
          Add to thread
        </button>
      </div>

      {/* ── Posts ── */}
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-lg space-y-0">
          {posts.map((post, index) => {
            const committedMedia = getPostMedia(post);
            const pendingMedia = pendingByPost.get(index) ?? [];
            const allMediaCount = committedMedia.length + pendingMedia.length;
            const canAddMore = allMediaCount < MAX_MEDIA_PER_TWEET;
            const isDragTarget = dragOverIndex === index;

            return (
              <div
                key={`tweet-${index}`}
                className={`group relative border-x border-b first:rounded-t-2xl first:border-t last:rounded-b-2xl bg-card px-4 py-3 transition-colors ${
                  isDragTarget
                    ? "border-primary/60 ring-1 ring-primary/30"
                    : "border-border/50"
                }`}
                onDragOver={(e) => handleCardDragOver(e, index)}
                onDragLeave={handleCardDragLeave}
                onDrop={(e) => handleCardDrop(e, index)}
              >
                {/* Remove post (thread only) */}
                {isThread ? (
                  <button
                    type="button"
                    className="absolute right-2 top-2 rounded-full p-1 text-muted-foreground/40 opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                    onClick={() => handleRemovePost(index)}
                    title="Remove from thread"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                ) : null}

                {/* Post layout — avatar left, content right */}
                <div className="flex gap-2.5">
                  <div className="relative w-10 shrink-0">
                    {author.avatar ? (
                      <img
                        src={author.avatar}
                        alt={author.name}
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                        {author.name.charAt(0)}
                      </div>
                    )}
                    {/* Thread connector — runs from below avatar to bottom of card + gap */}
                    {isThread && index < posts.length - 1 ? (
                      <div className="absolute left-1/2 top-[calc(2.5rem+4px)] -bottom-3 w-0.5 -translate-x-1/2 bg-border/50" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    {/* Author name + handle */}
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[15px] font-bold leading-tight text-foreground">
                        {author.name}
                      </span>
                      <XLogo className="h-3 w-3 shrink-0 text-foreground" />
                    </div>
                    <div className="text-[13px] text-muted-foreground">@{author.handle.replace(/^@/, "")}</div>

                    {/* Text — click to edit */}
                    <div className="mt-2">
                      {editingIndex === index ? (
                        <textarea
                          className="w-full resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-[15px] leading-relaxed text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                          value={post.text}
                          onChange={(e) => handleTextChange(index, e.target.value)}
                          onBlur={() => setEditingIndex(null)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") setEditingIndex(null);
                          }}
                          autoFocus
                          rows={Math.max(2, post.text.split("\n").length + 1)}
                        />
                      ) : (
                        <div
                          className="-mx-1 cursor-text whitespace-pre-wrap rounded px-1 text-[15px] leading-relaxed text-foreground transition hover:bg-surface-2/40"
                          onClick={() => setEditingIndex(index)}
                          title="Click to edit"
                        >
                          {post.text}
                        </div>
                      )}
                    </div>

                    {/* Media gallery */}
                    {committedMedia.length > 0 || pendingMedia.length > 0 ? (
                      <div
                        className={`relative mt-2 grid gap-0.5 overflow-hidden rounded-2xl border border-border/40 ${
                          allMediaCount === 1 ? "grid-cols-1" : "grid-cols-2"
                        }`}
                      >
                        {/* Committed media */}
                        {committedMedia.map((item, mi) => (
                          <div
                            key={`media-${mi}`}
                            className={`relative overflow-hidden bg-surface-2 ${
                              allMediaCount === 1 ? "aspect-video" :
                              allMediaCount === 3 && mi === 0 ? "row-span-2 aspect-auto h-full" :
                              "aspect-square"
                            }`}
                          >
                            <img
                              src={item.url}
                              alt="Tweet attachment"
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                            <button
                              type="button"
                              className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white transition hover:bg-black/80"
                              onClick={() => handleRemoveMedia(index, mi)}
                              title="Remove"
                            >
                              <XIcon className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                        {/* Pending uploads */}
                        {pendingMedia.map((item) => (
                          <div
                            key={item.id}
                            className={`relative overflow-hidden bg-surface-2 ${
                              allMediaCount === 1 ? "aspect-video" : "aspect-square"
                            }`}
                          >
                            <img
                              src={item.previewUrl}
                              alt=""
                              className="h-full w-full object-cover opacity-60"
                            />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {/* Add image button */}
                    {canAddMore ? (
                      <div className="mt-1.5 flex items-center">
                        <input
                          ref={(el) => {
                            fileInputRefs.current[index] = el;
                          }}
                          type="file"
                          accept="image/png,image/jpeg,image/gif,image/webp"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            const files = Array.from(e.target.files ?? []).filter((f) =>
                              ALLOWED_TWEET_MEDIA_TYPES.has(f.type),
                            );
                            if (files.length > 0) handleAddMedia(index, files);
                            e.target.value = "";
                          }}
                        />
                        <button
                          type="button"
                          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-muted-foreground/50 transition hover:bg-surface-2 hover:text-foreground"
                          onClick={() => fileInputRefs.current[index]?.click()}
                          title="Add image"
                        >
                          <ImagePlus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : null}

                    {/* Engagement stats */}
                    {typeof post.replies === "number" ||
                    typeof post.retweets === "number" ||
                    typeof post.likes === "number" ? (
                      <div className="mt-2 flex items-center gap-5 border-t border-border/30 pt-2 text-muted-foreground">
                        {typeof post.replies === "number" ? (
                          <span className="flex items-center gap-1.5 text-[13px]">
                            <MessageCircle className="h-[15px] w-[15px]" />
                            {formatCount(post.replies)}
                          </span>
                        ) : null}
                        {typeof post.retweets === "number" ? (
                          <span className="flex items-center gap-1.5 text-[13px]">
                            <Repeat2 className="h-[15px] w-[15px]" />
                            {formatCount(post.retweets)}
                          </span>
                        ) : null}
                        {typeof post.likes === "number" ? (
                          <span className="flex items-center gap-1.5 text-[13px]">
                            <Heart className="h-[15px] w-[15px]" />
                            {formatCount(post.likes)}
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    {/* Timestamp */}
                    {post.timestamp ? (
                      <div className="mt-1.5 text-[12px] text-muted-foreground/50">{post.timestamp}</div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
