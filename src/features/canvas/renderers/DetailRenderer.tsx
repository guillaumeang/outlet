import type { DetailBody } from "../types";

type DetailRendererProps = {
  body: DetailBody;
  onSendPrompt: (prompt: string) => void;
};

const formatFieldValue = (value: string | number | boolean | null): string => {
  if (value === null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
};

export const DetailRenderer = ({ body, onSendPrompt }: DetailRendererProps) => {
  const { fields } = body;

  if (fields.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="font-mono text-[11px] text-muted-foreground">No fields</div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((field, index) => {
          const isClickable = Boolean(field.prompt);
          return (
            <div
              key={`detail-field-${index}`}
              role={isClickable ? "button" : undefined}
              tabIndex={isClickable ? 0 : undefined}
              className={`rounded-lg border border-border/60 bg-surface-2/30 px-4 py-3 ${
                isClickable
                  ? "cursor-pointer transition hover:border-primary/40 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
                  : ""
              }`}
              onClick={isClickable ? () => onSendPrompt(field.prompt!) : undefined}
              onKeyDown={
                isClickable
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSendPrompt(field.prompt!);
                      }
                    }
                  : undefined
              }
            >
              <div className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {field.label}
              </div>
              <div className="mt-1 text-sm font-medium text-foreground">
                {formatFieldValue(field.value)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
