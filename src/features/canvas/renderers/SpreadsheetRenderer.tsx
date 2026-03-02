import type { SpreadsheetBody } from "../types";

type SpreadsheetRendererProps = {
  body: SpreadsheetBody;
};

const alignClass = (align?: "left" | "center" | "right") => {
  if (align === "center") return "text-center";
  if (align === "right") return "text-right";
  return "text-left";
};

const formatCell = (value: string | number | boolean | null): string => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
};

export const SpreadsheetRenderer = ({ body }: SpreadsheetRendererProps) => {
  const { columns, rows } = body;

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="font-mono text-[11px] text-muted-foreground">No data</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse font-mono text-[12px]">
        <thead className="sticky top-0 z-10 bg-surface-2">
          <tr className="border-b border-border">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`whitespace-nowrap px-3 py-2 font-semibold text-muted-foreground ${alignClass(col.align)}`}
              >
                {col.label ?? col.key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              className="border-b border-border/40 transition-colors hover:bg-surface-2/40"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`whitespace-nowrap px-3 py-1.5 text-foreground ${alignClass(col.align)}`}
                >
                  {formatCell(row[col.key] ?? null)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
