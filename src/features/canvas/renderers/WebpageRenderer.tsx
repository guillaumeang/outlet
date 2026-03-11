import type { WebpageBody } from "../types";

type WebpageRendererProps = {
  body: WebpageBody;
};

/**
 * Validates that a URL uses a safe scheme (http or https).
 * Returns the URL if valid, null otherwise.
 */
const sanitizeUrl = (rawUrl: string): string | null => {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
};

export const WebpageRenderer = ({ body }: WebpageRendererProps) => {
  const { url, title } = body;
  const safeUrl = sanitizeUrl(url);

  if (!safeUrl) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        Blocked: only http:// and https:// URLs are allowed.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {title ? (
        <div className="shrink-0 border-b border-border/60 px-4 py-2">
          <div className="truncate font-mono text-[11px] text-muted-foreground">{title}</div>
          <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/50">
            {safeUrl}
          </div>
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <iframe
          src={safeUrl}
          title={title ?? safeUrl}
          className="h-full w-full border-0"
          sandbox="allow-scripts allow-forms allow-popups"
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      </div>
    </div>
  );
};
