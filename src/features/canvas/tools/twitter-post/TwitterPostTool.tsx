"use client";

import { useState, useCallback } from "react";
import { Heart, MessageCircle, Plus, Repeat2, Send, Trash2, X as XIcon } from "lucide-react";
import type { ToolComponentProps } from "../types";
import type { TwitterPostToolData, TwitterPost } from "./schema";

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

// ─── Component ───────────────────────────────────────────────────────────────

export const TwitterPostTool = ({ data, onLocalEdit, onSendPrompt }: Props) => {
  const { author, posts } = data;
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const handleTextChange = useCallback(
    (index: number, newText: string) => {
      const updatedPosts = posts.map((p, i) => (i === index ? { ...p, text: newText } : p));
      onLocalEdit({ posts: updatedPosts } as Partial<TwitterPostToolData>);
    },
    [posts, onLocalEdit],
  );

  const handleRemoveImage = useCallback(
    (index: number) => {
      const updatedPosts = posts.map((p, i) => {
        if (i !== index) return p;
        const { image: _removed, ...rest } = p;
        return rest as TwitterPost;
      });
      onLocalEdit({ posts: updatedPosts } as Partial<TwitterPostToolData>);
    },
    [posts, onLocalEdit],
  );

  const handleRemovePost = useCallback(
    (index: number) => {
      if (posts.length <= 1) return;
      const updatedPosts = posts.filter((_, i) => i !== index);
      onLocalEdit({ posts: updatedPosts } as Partial<TwitterPostToolData>);
    },
    [posts, onLocalEdit],
  );

  const isThread = posts.length > 1;

  return (
    <div className="flex h-full flex-col overflow-auto bg-background">
      {/* ── Action bar ── */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
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
          {posts.map((post, index) => (
            <div
              key={`tweet-${index}`}
              className="group relative border-x border-b first:rounded-t-2xl first:border-t last:rounded-b-2xl border-border/50 bg-card px-4 py-3"
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

                  {/* Image */}
                  {post.image ? (
                    <div className="relative mt-2 overflow-hidden rounded-2xl border border-border/40">
                      <img src={post.image} alt="Tweet attachment" className="w-full object-cover" />
                      <button
                        type="button"
                        className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white transition hover:bg-black/80"
                        onClick={() => handleRemoveImage(index)}
                        title="Remove image"
                      >
                        <XIcon className="h-3 w-3" />
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
          ))}
        </div>
      </div>
    </div>
  );
};
