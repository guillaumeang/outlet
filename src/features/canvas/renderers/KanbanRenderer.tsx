import type { KanbanBody } from "../types";

type KanbanRendererProps = {
  body: KanbanBody;
  onSendPrompt: (prompt: string) => void;
};

export const KanbanRenderer = ({ body, onSendPrompt }: KanbanRendererProps) => {
  const { columns } = body;

  if (columns.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="font-mono text-[11px] text-muted-foreground">No columns</div>
      </div>
    );
  }

  return (
    <div className="flex h-full gap-3 overflow-x-auto p-4">
      {columns.map((column, colIndex) => (
        <div
          key={column.id ?? `kanban-col-${colIndex}`}
          className="flex w-64 shrink-0 flex-col rounded-lg bg-surface-2/40 p-2"
        >
          <div className="mb-2 flex items-center justify-between px-1 py-1">
            <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {column.title}
            </h3>
            <span className="rounded-full bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/70">
              {column.cards.length}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {column.cards.map((card, cardIndex) => {
              const isClickable = Boolean(card.prompt);
              return (
                <div
                  key={card.id ?? `kanban-card-${colIndex}-${cardIndex}`}
                  role={isClickable ? "button" : undefined}
                  tabIndex={isClickable ? 0 : undefined}
                  className={`rounded-md border border-border/60 bg-card px-3 py-2.5 shadow-2xs ${
                    isClickable
                      ? "cursor-pointer transition hover:border-primary/40 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
                      : ""
                  }`}
                  onClick={isClickable ? () => onSendPrompt(card.prompt!) : undefined}
                  onKeyDown={
                    isClickable
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onSendPrompt(card.prompt!);
                          }
                        }
                      : undefined
                  }
                >
                  <div className="text-[13px] font-medium leading-snug text-foreground">
                    {card.title}
                  </div>
                  {card.subtitle ? (
                    <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {card.subtitle}
                    </div>
                  ) : null}
                  {card.meta ? (
                    <div className="mt-1.5 font-mono text-[10px] text-muted-foreground/60">
                      {card.meta}
                    </div>
                  ) : null}
                </div>
              );
            })}
            {column.cards.length === 0 ? (
              <div className="rounded-md border border-dashed border-border/50 px-3 py-4 text-center font-mono text-[10px] text-muted-foreground/50">
                Empty
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
};
