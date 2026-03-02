import type { WebpageBody } from "../types";

type WebpageRendererProps = {
  body: WebpageBody;
};

export const WebpageRenderer = ({ body }: WebpageRendererProps) => {
  const { url, title } = body;

  return (
    <div className="flex h-full flex-col">
      {title ? (
        <div className="shrink-0 border-b border-border/60 px-4 py-2">
          <div className="truncate font-mono text-[11px] text-muted-foreground">{title}</div>
          <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/50">
            {url}
          </div>
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <iframe
          src={url}
          title={title ?? url}
          className="h-full w-full border-0"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      </div>
    </div>
  );
};
