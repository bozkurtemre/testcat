// Per-build exploration artifact (Parts B + C).
//
// Produced once per app build by a strong model exploring the app with no test
// goal, then cached and reused across every run of that build. The expensive
// discovery (how to log in, how screens connect) is paid once, not per run.

export interface LoginStep {
  /** testcat-sim subcommand, e.g. "tap", "type", "describe-ui". The runner injects --udid. */
  command: string;
  /** Static args. A `{slot}` arg (e.g. `--text {email}`) is filled from the run's credentials. */
  args: string[];
  /** Optional human-readable reason shown in the event stream during replay. */
  note?: string;
  /**
   * Optional literal substring that must appear in describe-ui output BEFORE
   * this step runs (a stable label/identifier on the step's target screen).
   * Replay waits for it and re-taps the previous step a bounded number of
   * times if it does not appear — this is what keeps blind coordinate replay
   * honest on time-dependent screens (e.g. auto-advancing onboarding carousels,
   * async OTP screens) instead of drifting silently.
   */
  expect?: string;
}

/**
 * Deterministic login/onboarding replay template. The *flow* is stable within a
 * build; the *account* is not, so credential values live in the run, not here.
 */
export interface LoginFlow {
  steps: LoginStep[];
}

/** Cached exploration result for one build, keyed by build identity. */
export interface AppMapRecord {
  buildKey: string;
  /** Compact, scenario-agnostic navigation/screen map injected into runs as a speed hint. */
  appMap: string;
  /** Login replay template, or null if the build has no auth gate / it was not captured. */
  loginFlow: LoginFlow | null;
  /** Credential slot keys `loginFlow` references, surfaced so a run can supply them. */
  expectedSlots: string[];
  /** Model that produced this map (exploration runs with a strong model). */
  model: string;
  createdAt: string;
}

export type AppMapInput = Omit<AppMapRecord, "createdAt">;
