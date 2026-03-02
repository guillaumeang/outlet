import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, Zap } from "lucide-react";
import type { AgentState } from "@/features/agents/state/store";

type AgentDropdownProps = {
  agents: AgentState[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
  onCreateAgent: () => void;
  createDisabled?: boolean;
};

export const AgentDropdown = ({
  agents,
  selectedAgentId,
  onSelectAgent,
  onCreateAgent,
  createDisabled,
}: AgentDropdownProps) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const selectedAgent =
    agents.find((a) => a.agentId === selectedAgentId) ?? agents[0] ?? null;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        className="flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-xs font-medium text-foreground transition hover:bg-surface-2"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid="agent-dropdown-toggle"
      >
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            selectedAgent?.status === "running" ? "bg-emerald-500" : "bg-muted-foreground/40"
          }`}
          aria-hidden="true"
        />
        <span className="max-w-[160px] truncate">
          {selectedAgent?.name ?? "No agent"}
        </span>
        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
      </button>

      {open ? (
        <div
          className="ui-card ui-menu-popover absolute left-0 top-9 z-[260] max-h-72 min-w-48 overflow-y-auto p-1"
          role="listbox"
          aria-label="Select agent"
        >
          {agents.length === 0 ? (
            <div className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
              No agents available
            </div>
          ) : (
            agents.map((agent) => {
              const isSelected = agent.agentId === selectedAgentId;
              return (
                <button
                  key={agent.agentId}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left font-mono text-[11px] transition ${
                    isSelected
                      ? "bg-surface-2 font-medium text-foreground"
                      : "font-normal text-foreground hover:bg-surface-2/60"
                  }`}
                  onClick={() => {
                    onSelectAgent(agent.agentId);
                    setOpen(false);
                  }}
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      agent.status === "running" ? "bg-emerald-500" : "bg-muted-foreground/30"
                    }`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">{agent.name}</span>
                  {agent.awaitingUserInput ? (
                    <Zap
                      className="ml-auto h-3 w-3 shrink-0 text-amber-500"
                      aria-label="Awaiting input"
                    />
                  ) : null}
                </button>
              );
            })
          )}
          <div className="mt-1 border-t border-border/60 pt-1">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left font-mono text-[11px] font-medium text-muted-foreground transition hover:bg-surface-2/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => {
                onCreateAgent();
                setOpen(false);
              }}
              disabled={createDisabled}
              data-testid="agent-dropdown-create"
            >
              <Plus className="h-3 w-3 shrink-0" />
              New Agent
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
