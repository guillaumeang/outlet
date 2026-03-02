import type { CanvasPayload } from "../types";

type FallbackRendererProps = {
  payload: CanvasPayload;
};

export const FallbackRenderer = ({ payload }: FallbackRendererProps) => {
  return (
    <div className="flex h-full flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Unsupported canvas type
        </div>
        <div className="mt-1 font-mono text-[11px] text-muted-foreground/70">
          {(payload.body as { type?: string }).type ?? "unknown"}
        </div>
        <pre className="mt-4 max-h-64 overflow-auto rounded-md bg-surface-2 px-3 py-3 font-mono text-[10px] text-muted-foreground">
          {JSON.stringify(payload, null, 2)}
        </pre>
      </div>
    </div>
  );
};
