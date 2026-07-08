// Login replay (Part C).
//
// A recorded login/onboarding flow is a *template*, never a copy of one
// account's data. It captures the steps and, for input steps, which credential
// each one needs via a `{slot}` placeholder in the args (e.g. `--text {email}`).
// The login *flow* is stable within a build, but the *account* changes per run,
// so credentials are filled in at replay time from the run's own credential map.
//
// Filled-in values are returned as `secrets` so the caller can redact them in
// the emitted/persisted command string — otherwise the typed email/OTP would
// leak into the event stream (which is written to SQLite and shown in the chat).

import type { LoginFlow } from "@testcat/shared";

export type { LoginFlow, LoginStep } from "@testcat/shared";

export interface FilledStep {
  /** Full testcat-sim args with credential slots substituted. */
  args: string[];
  /** Substituted credential values — redact these in any emitted command string. */
  secrets: string[];
  note?: string;
  /** Literal substring that must be on-screen before this step runs (see LoginStep.expect). */
  expect?: string;
}

const SLOT_PATTERN = /^\{([a-zA-Z0-9_]+)\}$/;
export const REDACTION = "«redacted»";

export class MissingCredentialError extends Error {
  constructor(public readonly slot: string) {
    super(`Login flow needs credential "${slot}" but the run provided none.`);
    this.name = "MissingCredentialError";
  }
}

/** Slot keys the flow references (deduped, in first-seen order). */
export function loginFlowSlots(flow: LoginFlow): string[] {
  const slots: string[] = [];
  for (const step of flow.steps) {
    for (const arg of step.args) {
      const match = SLOT_PATTERN.exec(arg);
      if (match && !slots.includes(match[1])) slots.push(match[1]);
    }
  }
  return slots;
}

/**
 * Substitute every `{slot}` arg with the run's credential value. Throws
 * MissingCredentialError on the first referenced slot with no (non-empty) value,
 * so a misconfigured run fails fast instead of typing an empty/placeholder login.
 */
export function fillLoginFlow(
  flow: LoginFlow,
  credentials: Record<string, string>,
): FilledStep[] {
  return flow.steps.map((step) => {
    const secrets: string[] = [];
    const args = step.args.map((arg) => {
      const match = SLOT_PATTERN.exec(arg);
      if (!match) return arg;
      const slot = match[1];
      const value = credentials[slot];
      if (value == null || value === "") throw new MissingCredentialError(slot);
      secrets.push(value);
      return value;
    });
    return {
      args,
      secrets,
      ...(step.note ? { note: step.note } : {}),
      ...(step.expect ? { expect: step.expect } : {}),
    };
  });
}

/**
 * Expand a per-app credential template into concrete per-device credentials.
 * Templates come from Settings (e.g. `{"email":"{testId}-sim-{simIndex}@corp.com","otp":"111111"}`);
 * `{testId}` is the run id's first 8 chars and `{simIndex}` the 1-based device
 * index, so every run gets a fresh account while the flow itself stays stable.
 */
export function expandCredentialTemplate(
  template: Record<string, string> | null | undefined,
  context: { runId: string; simIndex: number },
): Record<string, string> {
  if (!template) return {};
  const testId = context.runId.slice(0, 8);
  const out: Record<string, string> = {};
  for (const [slot, value] of Object.entries(template)) {
    out[slot] = value
      .split("{testId}")
      .join(testId)
      .split("{simIndex}")
      .join(String(context.simIndex));
  }
  return out;
}

/** Replace each secret with a redaction marker so it never reaches the event log. */
export function redactCommand(command: string, secrets: string[]): string {
  let out = command;
  for (const secret of secrets) {
    if (secret) out = out.split(secret).join(REDACTION);
  }
  return out;
}
