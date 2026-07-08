import type { AgentEvent, RunDoneMessage, ToolFamily } from "@testcat/shared";
import {
  ArrowDown,
  Brain,
  Check,
  Copy,
  FilePlus,
  FileText,
  Pencil,
  Plug,
  Sparkles,
  Terminal,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Item =
  | { kind: "text"; text: string; timestamp?: string }
  | { kind: "thinking"; text: string; timestamp?: string }
  | {
      kind: "tool";
      name: string;
      family: ToolFamily;
      input: unknown;
      result?: { ok: boolean; output: string };
      timestamp?: string;
    };

function buildItems(events: AgentEvent[]): Item[] {
  const items: Item[] = [];
  for (const e of events) {
    const last = items[items.length - 1];
    if (e.type === "text_delta") {
      if (last?.kind === "text") last.text += e.text;
      else items.push({ kind: "text", text: e.text, timestamp: e.timestamp });
    } else if (e.type === "thinking_delta") {
      if (last?.kind === "thinking") last.text += e.text;
      else items.push({ kind: "thinking", text: e.text, timestamp: e.timestamp });
    } else if (e.type === "tool_use") {
      items.push({
        kind: "tool",
        name: e.name,
        family: e.family,
        input: e.input,
        timestamp: e.timestamp,
      });
    } else if (e.type === "tool_result") {
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (it.kind === "tool" && !it.result) {
          it.result = { ok: e.ok, output: e.output };
          break;
        }
      }
    }
  }
  return items;
}

const FAMILY_ICON: Record<ToolFamily, typeof Terminal> = {
  read: FileText,
  edit: Pencil,
  write: FilePlus,
  exec: Terminal,
  skill: Sparkles,
  mcp: Plug,
  other: Wrench,
};

const summarize = (input: unknown): string => {
  if (input == null) return "";
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
};

const formatForCopy = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const copyTextForItem = (item: Item): string => {
  if (item.kind === "text" || item.kind === "thinking") return item.text;

  const input = formatForCopy(item.input);
  const inputLabel = item.family === "exec" ? "Command" : "Input";
  const parts = [`Tool: ${item.name}`, `Family: ${item.family}`];

  if (input) {
    parts.push("", `${inputLabel}:`, input);
  }

  if (item.result) {
    parts.push(
      "",
      `Result: ${item.result.ok ? "ok" : "error"}`,
      item.result.output,
    );
  }

  return parts.join("\n");
};

const formatTimestamp = (timestamp?: string): string | null => {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the textarea fallback below. Electron builds can vary
      // in Clipboard API availability depending on origin/security context.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}

export function ChatPane({
  events,
  done,
}: {
  events: AgentEvent[];
  done: RunDoneMessage | null;
}) {
  const items = useMemo(() => buildItems(events), [events]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const followOutputRef = useRef(true);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);

  const updateFollowState = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom < 48;
    followOutputRef.current = atBottom;
    setShowJumpToBottom(!atBottom);
  };

  const scrollToBottom = (behavior: ScrollBehavior = "auto") => {
    followOutputRef.current = true;
    setShowJumpToBottom(false);
    endRef.current?.scrollIntoView({ behavior, block: "end" });
  };

  useEffect(() => {
    if (followOutputRef.current) scrollToBottom();
  }, [events.length, done]);

  return (
    <div
      ref={scrollRef}
      onScroll={updateFollowState}
      className="relative h-full min-h-0 flex-1 overflow-auto p-3"
    >
      {items.length === 0 && !done && (
        <p className="rounded-md border border-dashed border-border bg-background/30 px-3 py-8 text-center text-sm text-muted-foreground">
          Waiting for the agent…
        </p>
      )}
      <div className="flex flex-col gap-2.5">
        {items.map((it, i) => (
          <Block key={i} item={it} />
        ))}
        {done?.result && (
          <div className="group relative rounded-md border border-primary/25 bg-[#18352d]/45 px-3.5 py-2.5 pr-11 text-sm leading-relaxed whitespace-pre-wrap">
            <span className="mb-1 block font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-primary">
              Result
            </span>
            {done.result}
            <Timestamp value={done.timestamp} />
            <CopyItemButton
              text={`Result:\n${done.result}`}
              label="Copy result"
              className="absolute top-2 right-2"
            />
          </div>
        )}
        <div className="h-10 shrink-0" aria-hidden />
      </div>
      <div ref={endRef} />
      {showJumpToBottom && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => scrollToBottom("smooth")}
              aria-label="Jump to bottom"
              className="sticky bottom-3 z-20 -mt-10 ml-auto mr-1 grid size-8 place-items-center rounded-md border border-primary/30 bg-card/95 text-primary shadow-lg backdrop-blur transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowDown className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" sideOffset={6}>
            Jump to bottom
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

function Block({ item }: { item: Item }) {
  if (item.kind === "text") {
    return (
      <div className="group relative rounded-md border border-border bg-card px-3.5 py-2.5 pr-11 text-sm leading-relaxed whitespace-pre-wrap shadow-xs">
        {item.text}
        <Timestamp value={item.timestamp} />
        <CopyItemButton
          text={copyTextForItem(item)}
          label="Copy output"
          className="absolute top-2 right-2"
        />
      </div>
    );
  }
  if (item.kind === "thinking") {
    return (
      <div className="group relative rounded-md border border-border/70 bg-background/35 px-3 py-2 pr-11 text-sm text-muted-foreground">
        <div className="flex gap-2">
          <Brain className="mt-0.5 size-4 shrink-0" />
          <span className="whitespace-pre-wrap italic leading-relaxed">
            {item.text}
          </span>
        </div>
        <Timestamp value={item.timestamp} />
        <CopyItemButton
          text={copyTextForItem(item)}
          label="Copy output"
          className="absolute top-2 right-2"
        />
      </div>
    );
  }

  const Icon = FAMILY_ICON[item.family];
  const summary = summarize(item.input);
  return (
    <div className="group relative overflow-hidden rounded-md border border-border bg-background/45 text-sm">
      <CopyItemButton
        text={copyTextForItem(item)}
        label="Copy command and result"
        className="absolute top-1.5 right-1.5 z-10"
      />
      <div className="flex items-center gap-2 px-3 py-2 pr-10">
        <Icon className="size-4 shrink-0 text-primary" />
        <span className="font-mono text-xs font-medium">{item.name}</span>
        {summary && (
          <span className="truncate font-mono text-xs text-muted-foreground">
            {summary}
          </span>
        )}
        {item.result && (
          <span
            className={cn(
              "ml-auto shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium",
              item.result.ok
                ? "border-primary/25 bg-primary/10 text-primary"
                : "border-destructive/25 bg-destructive/15 text-destructive",
            )}
          >
            {item.result.ok ? "ok" : "error"}
          </span>
        )}
      </div>
      {item.result?.output && (
        <pre className="max-h-40 overflow-auto border-t border-border px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {item.result.output.slice(0, 2000)}
        </pre>
      )}
      {formatTimestamp(item.timestamp) && (
        <div className="border-t border-border/60 px-3 py-1.5">
          <Timestamp value={item.timestamp} inline />
        </div>
      )}
    </div>
  );
}

function Timestamp({
  value,
  inline = false,
}: {
  value?: string;
  inline?: boolean;
}) {
  const formatted = formatTimestamp(value);
  if (!formatted) return null;
  return (
    <span
      className={cn(
        "block text-left font-mono text-[10px] leading-none text-muted-foreground/65",
        inline ? "" : "mt-2",
      )}
    >
      {formatted}
    </span>
  );
}

function CopyItemButton({
  text,
  label,
  className,
}: {
  text: string;
  label: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await writeClipboard(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={label}
          className={cn(
            "grid size-6 place-items-center rounded border border-border/70 bg-background/80 text-muted-foreground opacity-65 shadow-sm transition hover:border-primary/35 hover:bg-accent hover:text-foreground hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:opacity-100 group-hover:opacity-100",
            className,
          )}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="left" sideOffset={6}>
        {copied ? "Copied" : label}
      </TooltipContent>
    </Tooltip>
  );
}
