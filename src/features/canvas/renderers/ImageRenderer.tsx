import type { ImageBody } from "../types";

type ImageRendererProps = {
  body: ImageBody;
};

export const ImageRenderer = ({ body }: ImageRendererProps) => {
  const { src, alt, caption } = body;

  return (
    <div className="flex h-full flex-col items-center justify-center p-4">
      <div className="max-h-full max-w-full overflow-hidden rounded-lg border border-border/60 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt ?? "Canvas image"}
          className="block max-h-[calc(100vh-200px)] max-w-full object-contain"
          loading="lazy"
        />
      </div>
      {caption ? (
        <div className="mt-3 max-w-prose text-center font-mono text-[11px] text-muted-foreground">
          {caption}
        </div>
      ) : null}
    </div>
  );
};
