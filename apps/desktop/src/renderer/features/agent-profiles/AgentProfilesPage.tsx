import type { AgentProfile } from "@testcat/shared";
import {
  Bot,
  Pencil,
  Plus,
  RefreshCw,
  Terminal,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ClaudeLogo,
  OllamaLogo,
  OpencodeLogo,
  OpenAiLogo,
} from "./AgentLogos";
import { ProfileDialog } from "./ProfileDialog";

export function AgentProfilesPage() {
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AgentProfile | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProfiles(await window.testcat.profilesList());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!profiles.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !profiles.some((p) => p.id === selectedId)) {
      setSelectedId(profiles[0].id);
    }
  }, [profiles, selectedId]);

  const selected = profiles.find((p) => p.id === selectedId) ?? null;

  const onNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const onEdit = (p: AgentProfile) => {
    setEditing(p);
    setDialogOpen(true);
  };
  const onDelete = async (p: AgentProfile) => {
    if (!window.confirm(`Delete profile "${p.name}"?`)) return;
    try {
      await window.testcat.profilesDelete(p.id);
      void refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header data-page-reveal className="ide-panel flex items-center justify-between gap-4 border-b border-border px-5 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-base font-semibold tracking-tight">
              Agent Profiles
            </h1>
            {!loading && !error && profiles.length > 0 && (
              <Badge variant="outline">{profiles.length}</Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Reusable CLI, model, skill and prompt presets for simulator runs.
          </p>
        </div>
        <Button onClick={onNew}>
          <Plus /> New profile
        </Button>
      </header>

      <div data-page-scroll className="min-h-0 flex-1 overflow-auto p-5">
        {loading ? (
          <div data-page-reveal className="grid gap-4 lg:grid-cols-[360px_1fr]">
            <ListSkeleton />
            <div className="h-96 animate-pulse rounded-lg border border-border bg-card" />
          </div>
        ) : error ? (
          <div data-page-reveal className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
            <p className="text-sm font-medium text-destructive">Couldn’t read the local database.</p>
            <p className="mt-0.5 font-mono text-xs text-destructive/70">{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void refresh()}>
              <RefreshCw /> Retry
            </Button>
          </div>
        ) : profiles.length === 0 ? (
          <EmptyState onNew={onNew} />
        ) : (
          <div className="grid min-h-[620px] gap-4 lg:grid-cols-[360px_1fr]">
            <div data-page-reveal className="ide-panel rounded-lg border border-border">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Profiles
                </span>
                <Button variant="ghost" size="icon" className="size-7" onClick={() => void refresh()}>
                  <RefreshCw className="size-3.5" />
                </Button>
              </div>
              <div className="divide-y divide-border">
                {profiles.map((p) => (
                  <ProfileRow
                    key={p.id}
                    profile={p}
                    active={p.id === selected?.id}
                    onSelect={() => setSelectedId(p.id)}
                    onEdit={() => onEdit(p)}
                    onDelete={() => onDelete(p)}
                  />
                ))}
              </div>
            </div>

            {selected && (
              <div data-page-reveal className="ide-panel overflow-hidden rounded-lg border border-border">
                <div className="flex items-start justify-between gap-4 border-b border-border p-5">
                  <div className="flex min-w-0 items-start gap-3">
                    <ProfileIcon cli={selected.cli} size="lg" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate font-heading text-xl font-semibold tracking-tight">
                          {selected.name}
                        </h2>
                        <span className="size-2 rounded-full bg-primary" />
                      </div>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {selected.cli}/{selected.model} · {selected.reasoning}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => onEdit(selected)}>
                      <Pencil /> Edit
                    </Button>
                    <Button variant="ghost" size="icon" className="size-8" onClick={() => onDelete(selected)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid gap-4 p-5 xl:grid-cols-[1fr_320px]">
                  <div className="space-y-4">
                    <div className="rounded-md border border-border bg-background/35 p-4">
                      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                        System prompt
                      </p>
                      <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground/90">
                        {selected.systemPrompt || "No system prompt configured."}
                      </pre>
                    </div>
                    <div className="rounded-md border border-border bg-background/35 p-4">
                      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                        Skills
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {selected.skills.length ? (
                          selected.skills.map((s) => (
                            <Badge key={s} variant="accent">
                              {s}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">No skills attached.</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <ConfigStat label="CLI" value={selected.cli} />
                    <ConfigStat label="Model" value={selected.model} />
                    <ConfigStat label="Effort" value={selected.reasoning} />
                    <ConfigStat label="Snapshot safety" value="Run history keeps this config" muted />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <ProfileDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        profile={editing}
        onSaved={() => {
          setDialogOpen(false);
          void refresh();
        }}
      />
    </div>
  );
}

function ProfileRow({
  profile,
  active,
  onSelect,
  onEdit,
  onDelete,
}: {
  profile: AgentProfile;
  active: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-3 px-3 py-3 transition-colors",
        active ? "bg-[#18352d]/45" : "hover:bg-accent/35",
      )}
    >
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <ProfileIcon cli={profile.cli} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{profile.name}</span>
            <span className="size-1.5 rounded-full bg-primary" />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant={profile.cli === "claude" || profile.cli === "ollama" || profile.cli === "opencode" ? "accent" : "outline"}>{profile.cli}</Badge>
            <span className="truncate font-mono text-[11px] text-muted-foreground">
              {profile.model}
            </span>
          </div>
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
        <Button variant="ghost" size="icon" className="size-7" onClick={onEdit}>
          <Pencil className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="size-7 hover:text-destructive" onClick={onDelete}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function ProfileIcon({ cli, size = "md" }: { cli: string; size?: "md" | "lg" }) {
  const claude = cli === "claude";
  const codex = cli === "codex";
  const ollama = cli === "ollama";
  const opencode = cli === "opencode";
  const iconClassName = size === "lg" ? "size-7" : "size-5";
  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-md border",
        size === "lg" ? "size-12" : "size-10",
        claude
          ? "border-[#d97757]/35 bg-[#f7efe8] text-[#d97757]"
          : codex
            ? "border-primary/25 bg-[#f4f7f5] text-[#111314]"
            : ollama || opencode
              ? "border-primary/25 bg-[#f4f7f5]"
              : "border-[#c5a4e8]/40 bg-[#c5a4e8]/90 text-background",
      )}
      aria-label={claude ? "Claude" : codex ? "Codex" : ollama ? "Ollama Direct" : opencode ? "opencode" : cli}
    >
      {claude ? (
        <ClaudeLogo className={iconClassName} />
      ) : codex ? (
        <OpenAiLogo className={iconClassName} />
      ) : ollama ? (
        <OllamaLogo className={size === "lg" ? "h-7 w-5 object-contain" : "h-6 w-4.5 object-contain"} />
      ) : opencode ? (
        <OpencodeLogo className={size === "lg" ? "size-7 object-contain" : "size-5 object-contain"} />
      ) : (
        <Terminal className={size === "lg" ? "size-5" : "size-4"} />
      )}
    </div>
  );
}

function ConfigStat({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-background/35 p-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-2 break-words text-sm font-medium", muted && "text-muted-foreground")}>{value}</p>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="divide-y divide-border">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-3">
            <div className="size-10 shrink-0 animate-pulse rounded-md bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-40 animate-pulse rounded bg-muted" />
              <div className="h-3 w-56 animate-pulse rounded bg-muted/60" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div data-page-reveal className="mx-auto flex max-w-md flex-col items-center px-6 py-16 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
        <Bot className="size-7" strokeWidth={1.75} />
      </div>
      <h2 className="font-heading text-lg font-semibold tracking-tight">No agent profiles yet</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        A profile bundles the CLI, model, effort, skills and prompt that execute each run.
      </p>
      <Button className="mt-5" onClick={onNew}>
        <Plus /> Create your first profile
      </Button>
    </div>
  );
}
