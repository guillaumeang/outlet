import type { ListBody } from "../types";

type ListRendererProps = {
  body: ListBody;
  onSendPrompt: (prompt: string) => void;
};

export const ListRenderer = ({ body, onSendPrompt }: ListRendererProps) => {
  const { items } = body;

  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="font-mono text-[11px] text-muted-foreground">No items</div>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/50">
      {items.map((item, index) => {
        const isClickable = Boolean(item.prompt);
        return (
          <div
            key={item.id ?? `list-item-${index}`}
            role={isClickable ? "button" : undefined}
            tabIndex={isClickable ? 0 : undefined}
            className={`flex items-start justify-between gap-3 px-4 py-3 ${
              isClickable
                ? "cursor-pointer transition hover:bg-surface-2/50 focus-visible:bg-surface-2/50 focus-visible:outline-none"
                : ""
            }`}
            onClick={isClickable ? () => onSendPrompt(item.prompt!) : undefined}
            onKeyDown={
              isClickable
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSendPrompt(item.prompt!);
                    }
                  }
                : undefined
            }
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">{item.title}</div>
              {item.subtitle ? (
                <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                  {item.subtitle}
                </div>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {item.meta ? (
                <span className="font-mono text-[10px] text-muted-foreground/70">{item.meta}</span>
              ) : null}
              {item.badge ? (
                <span className="rounded-full bg-surface-3 px-2 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
                  {item.badge}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
};
