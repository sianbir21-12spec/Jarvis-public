// server/state/computerControlState.ts
//
// The single source of truth for whether autonomous computer control is
// currently allowed to run. Defaults OFF on every server start (in-memory
// only -- never persisted server-side, so a crash/restart always requires
// re-enabling). The renderer flips this only after the user types the
// confirmation phrase in Settings (see ComputerControlSection in
// Settings.tsx) and calls POST /api/computer-control/enable.
//
// server/routes/agent.ts checks this before starting a run, and again on
// every tool dispatch, so a run that was mid-flight when the user hits the
// kill switch stops at the next tool call rather than finishing the task.

let enabled = false;
let enabledAt: number | null = null;

export function setComputerControlEnabled(next: boolean): boolean {
  enabled = !!next;
  enabledAt = enabled ? Date.now() : null;
  return enabled;
}

export function isComputerControlEnabled(): boolean {
  return enabled;
}

export function getComputerControlState() {
  return { enabled, enabledAt };
}
