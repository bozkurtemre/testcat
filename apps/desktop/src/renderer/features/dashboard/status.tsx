import type { TestRun, TestStatus } from "@testcat/shared";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatSecondsAndMinutes } from "@/lib/duration";
import { cn } from "@/lib/utils";

const BAD: TestStatus[] = ["failed", "error", "cancelled"];

/** Status + duration pill, shared by the dashboard list and run detail. */
export function RunStatusBadge({
  run,
  showDuration = true,
  className,
}: {
  run: TestRun;
  showDuration?: boolean;
  className?: string;
}) {
  if (run.status === "running" || run.status === "queued") {
    return (
      <Badge variant="accent" className={cn("max-w-full whitespace-nowrap", className)}>
        <Loader2 className="size-3 animate-spin" /> {run.status}
      </Badge>
    );
  }
  const duration =
    showDuration && run.durationMs != null
      ? ` · ${formatSecondsAndMinutes(run.durationMs)}`
      : "";
  const bad = BAD.includes(run.status);
  return (
    <Badge
      variant={bad ? "outline" : "accent"}
      className={cn(
        "max-w-full overflow-hidden whitespace-nowrap",
        bad && "border-destructive/30 text-destructive",
        className,
      )}
      title={`${run.status}${duration}`}
    >
      <span className="truncate">
        {run.status}
        {duration}
      </span>
    </Badge>
  );
}
