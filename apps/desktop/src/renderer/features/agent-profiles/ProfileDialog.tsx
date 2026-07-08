import {
  AGENT_CLIS,
  type AgentCli,
  type AgentProfile,
  type AgentProfileInput,
  type AppSettings,
  FALLBACK_MODELS,
  type ModelInfo,
  type ReasoningEffort,
} from "@testcat/shared";
import {
  Check,
  ChevronDown,
  Loader2,
  Search,
  Sparkles,
  Terminal,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type WheelEvent,
} from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FullscreenTopBar } from "@/features/shell/FullscreenTopBar";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  ClaudeLogo,
  OllamaLogo,
  OpencodeLogo,
  OpenAiLogo,
} from "./AgentLogos";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create, otherwise edit. */
  profile: AgentProfile | null;
  onSaved: () => void;
}

const defaults = (): AgentProfileInput => ({
  name: "",
  cli: "claude",
  model: FALLBACK_MODELS.claude[0].id,
  reasoning: FALLBACK_MODELS.claude[0].defaultEffort,
  skills: [],
  systemPrompt: "",
});

const parseSkills = (text: string): string[] =>
  text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const isModelAvailable = (model: ModelInfo | undefined): boolean =>
  model?.available !== false;

export function ProfileDialog({ open, onOpenChange, profile, onSaved }: Props) {
  const [form, setForm] = useState<AgentProfileInput>(defaults);
  const [skillsText, setSkillsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [enhancingPrompt, setEnhancingPrompt] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] =
    useState<Record<AgentCli, readonly ModelInfo[]>>(FALLBACK_MODELS);
  const [versions, setVersions] = useState<Record<
    AgentCli,
    string | null
  > | null>(null);
  const [settings, setSettings] = useState<AppSettings>({
    defaultEnhanceProfileId: null,
    explorationProfileId: null,
    credentialTemplate: null,
    physicalDeviceTeamId: null,
    physicalDeviceBundleId: null,
  });
  const [enhancerProfiles, setEnhancerProfiles] = useState<AgentProfile[]>([]);

  // Reset the form each time the dialog opens (create defaults or edit values).
  useEffect(() => {
    if (!open) return;
    setError(null);
    setEnhancingPrompt(false);
    if (profile) {
      setForm({
        name: profile.name,
        cli: profile.cli,
        model: profile.model,
        reasoning: profile.reasoning,
        skills: profile.skills,
        systemPrompt: profile.systemPrompt,
      });
      setSkillsText(profile.skills.join(", "));
    } else {
      setForm(defaults());
      setSkillsText("");
    }
  }, [open, profile]);

  // Pull the real, current model lists and the installed CLI versions for the
  // info line.
  useEffect(() => {
    if (!open) return;
    window.testcat.modelsList().then((m) => setModels(m), () => {});
    window.testcat.cliVersions().then((v) => setVersions(v), () => {});
    window.testcat.settingsGet().then(
      (next) => setSettings(next),
      () =>
        setSettings({
          defaultEnhanceProfileId: null,
          explorationProfileId: null,
          credentialTemplate: null,
          physicalDeviceTeamId: null,
          physicalDeviceBundleId: null,
        }),
    );
    window.testcat.profilesList().then(
      (next) => setEnhancerProfiles(next),
      () => setEnhancerProfiles([]),
    );
  }, [open]);

  const isOllama = form.cli === "ollama";
  const isOpencode = form.cli === "opencode";
  const isLocalDirect = isOllama;
  const cliModels = models[form.cli] ?? FALLBACK_MODELS[form.cli];
  const selModel = cliModels.find((m) => m.id === form.model);
  const firstModel = cliModels.find(isModelAvailable) ?? cliModels[0];
  // Keep an unknown (e.g. legacy) stored model selectable when editing.
  const modelOptions: readonly ModelInfo[] =
    selModel || !form.model || !firstModel
      ? cliModels
      : [
          {
            id: form.model,
            label: form.model,
            efforts: firstModel.efforts,
            defaultEffort: form.reasoning,
            available: false,
            availabilityReason:
              "This saved model is not present in the current model list.",
          },
          ...cliModels,
        ];
  const selectedModelOption = modelOptions.find((m) => m.id === form.model);
  const selectedModelUnavailable = selectedModelOption?.available === false;
  const efforts = (selModel ?? firstModel)?.efforts ?? ["medium"];

  // Switching CLI / model snaps effort into the new model's supported set.
  const setCli = (cli: AgentCli) => {
    const options = models[cli] ?? FALLBACK_MODELS[cli];
    const first = options.find(isModelAvailable) ?? options[0];
    setForm((f) => ({
      ...f,
      cli,
      model: first?.id ?? "",
      reasoning: first?.defaultEffort ?? "medium",
    }));
  };
  const setModel = (id: string) => {
    const m = cliModels.find((x) => x.id === id);
    if (m?.available === false) return;
    setForm((f) => ({
      ...f,
      model: id,
      reasoning:
        m && m.efforts.includes(f.reasoning)
          ? f.reasoning
          : (m?.defaultEffort ?? f.reasoning),
    }));
  };

  const skillsPreview = parseSkills(skillsText);
  const enhanceProfileAvailable = Boolean(
    settings.defaultEnhanceProfileId &&
      enhancerProfiles.some((p) => p.id === settings.defaultEnhanceProfileId),
  );
  const canEnhanceSystemPrompt = Boolean(
    form.systemPrompt.trim() &&
      enhanceProfileAvailable &&
      !enhancingPrompt &&
      !saving,
  );

  const submit = async () => {
    if (selectedModelUnavailable) {
      setError(
        selectedModelOption.availabilityReason ??
          "The selected model is not currently runnable.",
      );
      return;
    }
    setSaving(true);
    setError(null);
    const input: AgentProfileInput = {
      ...form,
      name: form.name.trim(),
      skills: isLocalDirect ? [] : skillsPreview,
    };
    try {
      if (profile) await window.testcat.profilesUpdate(profile.id, input);
      else await window.testcat.profilesCreate(input);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const enhanceSystemPrompt = async () => {
    if (!canEnhanceSystemPrompt) return;
    setEnhancingPrompt(true);
    setError(null);
    try {
      const result = await window.testcat.systemPromptEnhance({
        systemPrompt: form.systemPrompt.trim(),
      });
      setForm((f) => ({ ...f, systemPrompt: result.systemPrompt }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnhancingPrompt(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent fullScreen>
        <FullscreenTopBar onClose={() => onOpenChange(false)} />
        <DialogHeader
          data-fullscreen-page-header
          className="ide-panel shrink-0 flex-row items-center gap-3 space-y-0 border-b border-border px-6 py-4"
        >
          <div
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-md border border-primary/25 text-primary",
              isLocalDirect ? "bg-[#f4f7f5]" : "bg-primary/10",
            )}
          >
            <AgentCliLogo cli={form.cli} className="size-4.5" />
          </div>
          <div className="space-y-0.5">
            <DialogTitle className="font-heading text-base">
              {profile ? "Edit profile" : "New profile"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              An agent profile is required to run a test scenario.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="mx-auto min-h-0 w-full max-w-5xl flex-1 overflow-auto px-6 py-6">
          <div className="ide-panel grid gap-5 rounded-lg border border-border p-5">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Checkout smoke tester"
                autoComplete="off"
              />
            </div>

            {/* CLI-specific config: model + effort options follow the chosen CLI. */}
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1.1fr)]">
              <div className="grid gap-2">
                <Label>Agent CLI</Label>
                <Select
                  value={form.cli}
                  onValueChange={(v) => setCli(v as AgentCli)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      <span className="flex min-w-0 items-center gap-2">
                        <AgentCliLogo cli={form.cli} className="size-4" />
                        <span className="truncate">{agentCliLabel(form.cli)}</span>
                      </span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {AGENT_CLIS.map((c) => (
                      <SelectItem key={c} value={c}>
                        <span className="flex min-w-0 items-center gap-2">
                          <AgentCliLogo cli={c} className="size-4" />
                          <span className="truncate">{agentCliLabel(c)}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid min-w-0 gap-2">
                <Label>Model</Label>
                {modelOptions.length ? (
                  <ModelSearchSelect
                    value={form.model}
                    options={modelOptions}
                    selected={selectedModelOption}
                    onValueChange={setModel}
                  />
                ) : (
                  <p className="rounded-md border border-border bg-background/35 px-3 py-2 text-xs text-muted-foreground">
                    {isOllama
                      ? "No Ollama models found. Start Ollama and pull a model first."
                      : isOpencode
                        ? "No opencode models found. Install opencode or configure a provider first."
                        : "No models found for this agent."}
                  </p>
                )}
                {selectedModelUnavailable && (
                  <p className="text-xs text-destructive/80">
                    {selectedModelOption.availabilityReason ??
                      "This model is not currently runnable."}
                  </p>
                )}
              </div>
              {!isLocalDirect && (
                <div className="grid gap-2">
                  <Label>Effort</Label>
                  <Select
                    value={form.reasoning}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, reasoning: v as ReasoningEffort }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {efforts.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                          {form.cli === "claude" && r === "high"
                            ? " — recommended"
                            : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {versions && (
              <p className="-mt-2.5 rounded-md border border-border bg-background/35 px-3 py-2 text-[11px] text-muted-foreground">
                {versions[form.cli] ? (
                  <>
                    Detected{" "}
                    <span className="font-mono text-foreground/75">
                      {versions[form.cli]}
                    </span>
                  </>
                ) : (
                  <span className="text-destructive/80">
                    {form.cli === "ollama" ? (
                      <>Ollama daemon is not reachable — start Ollama to run local models</>
                    ) : form.cli === "opencode" ? (
                      <>opencode not found on PATH — install it to run opencode profiles</>
                    ) : (
                      <>
                        <code className="font-mono">{form.cli}</code> not found on PATH
                        — install it to run tests
                      </>
                    )}
                  </span>
                )}
              </p>
            )}

            {!isLocalDirect && (
              <div className="grid gap-2">
                <Label htmlFor="skills">Skills</Label>
                <Input
                  id="skills"
                  value={skillsText}
                  onChange={(e) => setSkillsText(e.target.value)}
                  placeholder="navigation, assertions"
                  autoComplete="off"
                />
                {skillsPreview.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {skillsPreview.map((s) => (
                      <Badge key={s} variant="accent">
                        {s}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Comma-separated extras. <code>testcat-ios</code> is always
                    included automatically — no need to list it.
                  </p>
                )}
              </div>
            )}

            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="sys">System prompt</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void enhanceSystemPrompt()}
                  disabled={!canEnhanceSystemPrompt}
                  title={
                    enhanceProfileAvailable
                      ? "Rewrite this system prompt in clear English"
                      : "Select a default enhance profile in Settings first"
                  }
                >
                  {enhancingPrompt ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Sparkles />
                  )}
                  {enhancingPrompt ? "Enhancing…" : "Enhance prompt"}
                </Button>
              </div>
              <Textarea
                id="sys"
                rows={8}
                value={form.systemPrompt}
                onChange={(e) =>
                  setForm((f) => ({ ...f, systemPrompt: e.target.value }))
                }
                placeholder="Describe how the agent should test the app…"
                className="resize-none font-mono text-sm leading-relaxed"
              />
            </div>

            {error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 font-mono text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="ide-panel shrink-0 border-t border-border px-6 py-4">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving || enhancingPrompt}
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={
              saving ||
              enhancingPrompt ||
              !form.name.trim() ||
              !form.model.trim() ||
              selectedModelUnavailable
            }
            className="active:translate-y-px"
          >
            {saving ? "Saving…" : profile ? "Save changes" : "Create profile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModelSearchSelect({
  value,
  options,
  selected,
  onValueChange,
}: {
  value: string;
  options: readonly ModelInfo[];
  selected: ModelInfo | undefined;
  onValueChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return options;
    return options.filter((model) =>
      [
        model.label,
        model.id,
        model.provider,
        model.availabilityReason,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [normalizedQuery, options]);

  const selectModel = (model: ModelInfo) => {
    if (model.available === false) return;
    onValueChange(model.id);
    setOpen(false);
  };

  const handleOptionsWheel = (event: WheelEvent<HTMLDivElement>) => {
    const list = event.currentTarget;
    if (list.scrollHeight <= list.clientHeight) return;

    const maxScrollTop = list.scrollHeight - list.clientHeight;
    const nextScrollTop = Math.min(
      maxScrollTop,
      Math.max(0, list.scrollTop + event.deltaY),
    );

    event.stopPropagation();
    if (nextScrollTop !== list.scrollTop) {
      event.preventDefault();
      list.scrollTop = nextScrollTop;
    }
  };

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setQuery("");
          window.setTimeout(() => inputRef.current?.focus(), 0);
        }
      }}
    >
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-background/45 px-3 py-2 text-left text-sm whitespace-nowrap shadow-xs outline-none transition-[color,box-shadow,background-color]",
            "focus-visible:border-ring focus-visible:bg-background/70 focus-visible:ring-[3px] focus-visible:ring-ring/25",
          )}
          title={selected ? `${selected.label} ${selected.id}` : value}
        >
          <span className="block min-w-0 flex-1 truncate">
            {selected?.label ?? value}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground opacity-50" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          collisionPadding={16}
          sideOffset={4}
          className="z-[60] w-[min(680px,calc(100vw-2rem))] min-w-[var(--radix-popover-trigger-width)] rounded-md border bg-popover text-popover-foreground shadow-md outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search models"
                className="h-8 pl-8 text-sm"
                autoComplete="off"
              />
            </div>
          </div>
          <div
            ref={listRef}
            className="max-h-[22rem] overflow-y-auto overscroll-contain p-1"
            onWheelCapture={handleOptionsWheel}
          >
            {filteredOptions.length ? (
              filteredOptions.map((model) => {
                const unavailable = model.available === false;
                const active = model.id === value;
                const fullName = `${model.label} ${model.id}`;
                const tooltip = model.availabilityReason
                  ? `${fullName}\n${model.availabilityReason}`
                  : fullName;
                return (
                  <button
                    key={model.id}
                    type="button"
                    aria-disabled={unavailable}
                    tabIndex={unavailable ? -1 : 0}
                    onClick={() => selectModel(model)}
                    title={tooltip}
                    aria-label={fullName}
                    className={cn(
                      "flex w-full min-w-0 items-center gap-2 rounded-sm px-2 py-2 text-left text-sm outline-none transition-colors",
                      "hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
                      unavailable &&
                        "cursor-not-allowed opacity-50 hover:bg-transparent hover:text-popover-foreground",
                    )}
                  >
                    <Check
                      className={cn(
                        "size-4 shrink-0",
                        active ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="min-w-0 truncate" title={model.label}>
                        {model.label}
                      </span>
                      <span
                        className="min-w-0 truncate font-mono text-[10px] text-muted-foreground"
                        title={model.id}
                      >
                        {model.id}
                      </span>
                    </span>
                    {unavailable && <Badge variant="outline">unavailable</Badge>}
                  </button>
                );
              })
            ) : (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                No matching models
              </p>
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function agentCliLabel(cli: AgentCli): string {
  if (cli === "ollama") return "Ollama Direct";
  if (cli === "claude") return "Claude";
  if (cli === "opencode") return "opencode";
  return "Codex";
}

function AgentCliLogo({
  cli,
  className,
}: {
  cli: AgentCli;
  className?: string;
}) {
  if (cli === "claude") return <ClaudeLogo className={className} />;
  if (cli === "codex") return <OpenAiLogo className={className} />;
  if (cli === "opencode") {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-sm bg-[#f4f7f5]",
          className,
        )}
      >
        <OpencodeLogo className="h-[76%] w-[76%] object-contain" />
      </span>
    );
  }
  if (cli === "ollama") {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-sm bg-[#f4f7f5]",
          className,
        )}
      >
        <OllamaLogo className="h-[82%] w-[62%] object-contain" />
      </span>
    );
  }
  return <Terminal className={className} />;
}
