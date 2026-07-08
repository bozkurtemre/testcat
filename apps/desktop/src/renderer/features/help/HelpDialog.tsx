import type { SetupInstallTarget, SetupStatus } from "@testcat/shared";
import {
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Copy,
  Download,
  ListChecks,
  MessageCircleQuestion,
  Play,
  RefreshCw,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
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
import { FullscreenTopBar } from "@/features/shell/FullscreenTopBar";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: Tab;
  onGoProfiles: () => void;
  onGoNewTest: () => void;
}

type Tab = "setup" | "faq";

export function HelpDialog({
  open,
  onOpenChange,
  initialTab = "setup",
  onGoProfiles,
  onGoNewTest,
}: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await window.testcat.setupStatus());
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    void refresh();
  }, [open, initialTab, refresh]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent fullScreen>
        <FullscreenTopBar onClose={() => onOpenChange(false)} />
        <DialogHeader
          data-fullscreen-page-header
          className="ide-panel shrink-0 border-b border-border px-6 py-4"
        >
          <DialogTitle className="font-heading text-base">
            Help &amp; setup
          </DialogTitle>
          <DialogDescription className="text-xs">
            Get testcat ready, then learn how it works.
          </DialogDescription>
        </DialogHeader>

        {/* Tab bar */}
        <div className="ide-panel flex shrink-0 items-center gap-2 border-b border-border px-6 py-2.5">
          <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
            <TabButton active={tab === "setup"} onClick={() => setTab("setup")}>
              <ListChecks className="size-4" /> Setup guide
            </TabButton>
            <TabButton active={tab === "faq"} onClick={() => setTab("faq")}>
              <MessageCircleQuestion className="size-4" /> FAQ
            </TabButton>
          </div>
          {tab === "setup" && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-muted-foreground"
              onClick={() => void refresh()}
              disabled={loading}
            >
              <RefreshCw className={cn(loading && "animate-spin")} /> Re-check
            </Button>
          )}
        </div>

        <div className="mx-auto min-h-0 w-full max-w-2xl flex-1 overflow-auto px-6 py-6">
          {tab === "setup" ? (
            <SetupGuide
              status={status}
              onRefresh={() => void refresh()}
              onGoProfiles={() => {
                onOpenChange(false);
                onGoProfiles();
              }}
              onGoNewTest={() => {
                onOpenChange(false);
                onGoNewTest();
              }}
            />
          ) : (
            <Faq />
          )}
        </div>

        <DialogFooter className="ide-panel shrink-0 border-t border-border px-6 py-4">
          <Button onClick={() => onOpenChange(false)} className="active:translate-y-px">
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/* ─────────────────────────── Setup guide ─────────────────────────── */

function InstallBtn({
  target,
  label,
  onRefresh,
}: {
  target: SetupInstallTarget;
  label: string;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="min-w-0">
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        className="active:translate-y-px"
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          try {
            const r = await window.testcat.setupInstall(target);
            setMsg(r.message);
          } catch (e) {
            setMsg(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
            onRefresh();
          }
        }}
      >
        {busy ? <RefreshCw className="animate-spin" /> : <Download />}
        {busy ? "Installing…" : label}
      </Button>
      {msg && (
        <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
          {msg}
        </p>
      )}
    </div>
  );
}

function SetupGuide({
  status,
  onRefresh,
  onGoProfiles,
  onGoNewTest,
}: {
  status: SetupStatus | null;
  onRefresh: () => void;
  onGoProfiles: () => void;
  onGoNewTest: () => void;
}) {
  const s = status;
  const hasAgent = Boolean(s?.claude || s?.codex || s?.opencode || s?.ollama);
  const hasControlPath = Boolean(s?.skill || s?.ollama);
  const step1 = Boolean(
    s?.testcatSim && hasControlPath && hasAgent && s.database && s.testcatAgent,
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        testcat drives real iOS simulators with an agent runtime. Three steps and
        you’re running tests. Commands run from the repo root; press{" "}
        <span className="font-medium text-foreground">Re-check</span> after each.
      </p>

      <Step n={1} done={step1} title="Install the toolchain">
        <p className="text-sm text-muted-foreground">
          The pieces testcat needs on your machine. Each lights up once detected.
        </p>

        <Line ok={Boolean(s?.testcatSim)}>
          <Label>
            <code>testcat-sim</code> on PATH
          </Label>
          <Hint>
            Our Swift CLI — it drives the simulators for the agent and feeds the
            live grid. Build it once and symlink onto your PATH:
          </Hint>
          {!s?.testcatSim && (
            <Cmd>{`swift build --package-path native/testcat-sim -c release
ln -s "$(pwd)/native/testcat-sim/.build/release/testcat-sim" /usr/local/bin/testcat-sim`}</Cmd>
          )}
        </Line>

        <Line ok={Boolean(s?.testcatDevice)}>
          <Label>
            <code>testcat-device</code> bundled runtime
          </Label>
          <Hint>
            Bundled physical iOS device CLI. It is only required when New Test
            uses physical-device preference, and needs Node.js and Xcode on this
            Mac.
            {s?.physicalDevices ? ` Detected physical devices: ${s.physicalDevices}.` : ""}
          </Hint>
        </Line>

        <Line ok={hasControlPath}>
          <Label>
            <code>testcat-ios</code> skill installed
          </Label>
          <Hint>
            Claude/Codex profiles load this skill to tap/swipe/boot simulators.
            Direct local providers use testcat’s built-in control loop. testcat
            installs the bundled skill automatically on launch.
          </Hint>
          {!hasControlPath && (
            <div className="mt-2">
              <InstallBtn
                target="agent-assets"
                label="Install skill"
                onRefresh={onRefresh}
              />
            </div>
          )}
        </Line>

        <Line ok={hasAgent}>
          <Label>An agent runtime available</Label>
          <Hint>
            The runtime that runs your tests — install <code>claude</code>,{" "}
            <code>codex</code>, <code>opencode</code>, or run a local Ollama
            daemon.
          </Hint>
          <div className="mt-1.5 flex gap-1.5">
            <Badge variant={s?.claude ? "accent" : "outline"}>
              claude {s?.claude ? "✓" : "—"}
            </Badge>
            <Badge variant={s?.codex ? "accent" : "outline"}>
              codex {s?.codex ? "✓" : "—"}
            </Badge>
            <Badge variant={s?.opencode ? "accent" : "outline"}>
              opencode {s?.opencode ? "✓" : "—"}
            </Badge>
            <Badge variant={s?.ollama ? "accent" : "outline"}>
              ollama {s?.ollama ? "✓" : "—"}
            </Badge>
          </div>
          {!hasAgent && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <InstallBtn
                target="claude"
                label="Install claude"
                onRefresh={onRefresh}
              />
              <InstallBtn
                target="codex"
                label="Install codex"
                onRefresh={onRefresh}
              />
              <InstallBtn
                target="opencode"
                label="Install opencode"
                onRefresh={onRefresh}
              />
              <InstallBtn
                target="ollama"
                label="Get Ollama"
                onRefresh={onRefresh}
              />
            </div>
          )}
        </Line>

        <Line ok={Boolean(s?.database)}>
          <Label>Local database ready</Label>
          <Hint>
            Electron main opens and migrates SQLite automatically. It persists
            every run — verdict, duration, and the full transcript — for the
            dashboard and replay.
          </Hint>
          {!s?.database && <Cmd>{`pnpm --filter @testcat/desktop dev`}</Cmd>}
        </Line>

        <Line ok={Boolean(s?.testcatAgent)}>
          <Label>
            <code>testcat-agent</code> QA identity installed
          </Label>
          <Hint>
            The QA &amp; Test Automation specialist identity every test run
            assumes — fully autonomous, read-only, evidence-based. Claude loads
            it natively; Codex/opencode get it prepended to their prompt.
            Installed automatically on launch.
          </Hint>
          {!s?.testcatAgent && (
            <div className="mt-2">
              <InstallBtn
                target="agent-assets"
                label="Install agent"
                onRefresh={onRefresh}
              />
            </div>
          )}
        </Line>
      </Step>

      <Step
        n={2}
        done={Boolean(s && s.profiles > 0)}
        title="Create an agent profile"
      >
        <p className="text-sm text-muted-foreground">
          A profile is the agent that runs your tests — it bundles a{" "}
          <span className="text-foreground">CLI</span>,{" "}
          <span className="text-foreground">model</span> and{" "}
          <span className="text-foreground">effort</span>,{" "}
          <span className="text-foreground">skills</span>, and a{" "}
          <span className="text-foreground">system prompt</span>. Add the{" "}
          <code>testcat-ios</code> skill so the agent can drive the simulator.
        </p>
        <Button
          variant="outline"
          className="mt-1 active:translate-y-px"
          onClick={onGoProfiles}
        >
          <Bot /> Open Agent Profiles
        </Button>
        {s && s.profiles > 0 && (
          <p className="text-xs text-muted-foreground">
            {s.profiles} profile{s.profiles === 1 ? "" : "s"} created.
          </p>
        )}
      </Step>

      <Step n={3} done={Boolean(s && s.runs > 0)} title="Create & run a test">
        <p className="text-sm text-muted-foreground">
          A test is four fields: a <span className="text-foreground">name</span>,
          a <span className="text-foreground">build</span> (path to a
          simulator-built <code>.app</code>), an{" "}
          <span className="text-foreground">agent profile</span>, and a{" "}
          <span className="text-foreground">scenario</span> — plain-language
          directives. The agent boots a simulator, installs the build, and
          exercises it while you watch the chat (left) and the live grid (right).
        </p>
        <Button
          className="mt-1 active:translate-y-px"
          onClick={onGoNewTest}
        >
          <Play /> New test
        </Button>
        {s && s.runs > 0 && (
          <p className="text-xs text-muted-foreground">
            {s.runs} run{s.runs === 1 ? "" : "s"} so far — see the Dashboard.
          </p>
        )}
      </Step>
    </div>
  );
}

function Step({
  n,
  done,
  title,
  children,
}: {
  n: number;
  done: boolean;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="ide-panel rounded-lg border border-border p-5">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            done
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          {done ? <Check className="size-4" /> : n}
        </div>
        <h3 className="font-heading text-base font-semibold tracking-tight">
          {title}
        </h3>
        {done && (
          <Badge variant="accent" className="ml-auto">
            done
          </Badge>
        )}
      </div>
      <div className="mt-4 space-y-4 pl-10">{children}</div>
    </div>
  );
}

function Line({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
      ) : (
        <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground/40" />
      )}
      <div className="min-w-0 flex-1 space-y-1.5">{children}</div>
    </div>
  );
}

const Label = ({ children }: { children: ReactNode }) => (
  <p className="text-sm font-medium [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px]">
    {children}
  </p>
);

const Hint = ({ children }: { children: ReactNode }) => (
  <p className="text-xs leading-relaxed text-muted-foreground [&_code]:font-mono [&_code]:text-foreground/80">
    {children}
  </p>
);

function Cmd({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div className="group relative">
      <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 px-3 py-2 pr-9 font-mono text-[11px] leading-relaxed">
        {children}
      </pre>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy command"
        className="absolute top-1.5 right-1.5 rounded p-1 text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground group-hover:opacity-100"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}

/* ─────────────────────────────── FAQ ─────────────────────────────── */

const FAQS: { q: string; a: ReactNode }[] = [
  {
    q: "What is testcat?",
    a: "An AI-agent-powered iOS simulator testing app. You describe a test in plain language; an agent runtime (Claude Code, Codex, opencode, or Ollama Direct) drives real simulators to run it while you watch a streamed chat of its reasoning (left) and a live grid of the simulators (right). Every run is saved.",
  },
  {
    q: "What's an agent profile?",
    a: "A reusable agent configuration — CLI, model, effort, skills, and a system prompt. A profile is required to run a test: it's the agent that executes it. Profiles are snapshotted onto each run, so editing or deleting one never corrupts past history.",
  },
  {
    q: "What's a test scenario?",
    a: "A name, a build (path to a simulator-built .app), an agent profile, and a scenario — the plain-language directives to test. There's no device field: the agent decides which simulator(s) to boot from the build and scenario.",
  },
  {
    q: "Which agent CLIs are supported?",
    a: (
      <>
        <code>claude</code> (Claude Code), <code>codex</code>,{" "}
        <code>opencode</code>, and <code>ollama</code> (Ollama Direct).
        Claude/Codex/opencode use their CLIs; Ollama Direct talks to the local
        Ollama daemon and uses Testcat's built-in simulator control loop.
      </>
    ),
  },
  {
    q: "How do models and efforts work?",
    a: (
      <>
        They’re real and current, not a fixed list. <b>Claude</b> uses the
        official aliases (<code>opus</code>, <code>sonnet</code>,{" "}
        <code>fable</code>, <code>haiku</code>) that always resolve to the latest
        model, with the real <code>--effort</code> levels (low…max).{" "}
        <b>Codex</b> models are read live from its own catalog, each with its own
        supported effort levels. <b>Ollama</b> models are read from the local
        daemon and use Testcat Direct with medium effort.
      </>
    ),
  },
  {
    q: "What is testcat-sim and why do I need it?",
    a: "Our Swift CLI (forked from baguette). It plays two roles: the agent uses it to control simulators (tap/swipe/boot) via the testcat-ios skill, and testcat consumes its screencast to paint the live grid. It's required and macOS-only.",
  },
  {
    q: "Why is the live grid view-only?",
    a: "You supervise; only the agent acts. There's no control path from the grid by design — it's monitoring-only. The grid auto-discovers whatever simulators the agent boots and streams each.",
  },
  {
    q: "Where are results stored?",
    a: "In a local SQLite database. Each run persists its verdict, duration, snapshots, and the full normalized event stream — that's what powers the Dashboard list and the run-detail replay.",
  },
  {
    q: "The live grid is empty — what's wrong?",
    a: (
      <>
        The grid only shows <i>booted</i> simulators. Make sure{" "}
        <code>testcat-sim</code> is on your PATH and that the agent has booted a
        simulator — it’s discovered automatically within a couple of seconds.
      </>
    ),
  },
  {
    q: "Why can't the app load saved data?",
    a: (
      <>
        Saved data now lives in the local SQLite database opened by Electron
        main. If loading fails, restart the desktop app and check the database
        path shown by <code>make db-path</code>.
      </>
    ),
  },
  {
    q: "Is testcat macOS-only?",
    a: "Yes. iOS simulators and testcat-sim are macOS-only, so testcat is too.",
  },
];

function Faq() {
  return (
    <div className="space-y-2.5">
      {FAQS.map((item) => (
        <details
          key={item.q}
      className="group rounded-lg border border-border bg-card/85 px-4 py-3"
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
            {item.q}
          </summary>
          <p className="mt-2 pl-6 text-sm leading-relaxed text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px] [&_code]:text-foreground/80">
            {item.a}
          </p>
        </details>
      ))}
    </div>
  );
}
