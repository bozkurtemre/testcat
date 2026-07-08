import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  onClose: () => void;
  closeLabel?: string;
}

const noDrag = "[-webkit-app-region:no-drag]";

export function FullscreenTopBar({ onClose, closeLabel = "Close" }: Props) {
  return (
    <header
      data-fullscreen-topbar
      className="ide-panel flex h-[34px] min-h-[34px] shrink-0 items-stretch border-b border-border bg-background/95 pr-2 pl-1.5 [-webkit-app-region:drag]"
    >
      <div
        className="app-chrome-traffic-space workspace-tabs-traffic mr-3 w-24 shrink-0 self-stretch"
        aria-hidden
      />
      <div className="min-w-0 flex-1 [-webkit-app-region:drag]" />
      <button
        type="button"
        onClick={onClose}
        aria-label={closeLabel}
        title={closeLabel}
        className={cn(
          "grid size-7 self-center place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground active:scale-95",
          noDrag,
        )}
      >
        <X className="size-4" />
      </button>
    </header>
  );
}
