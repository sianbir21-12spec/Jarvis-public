// server/state/planState.ts
//
// The task planner's state. Module-level singleton, same simplifying
// assumption the rest of the agent tooling already makes (terminal.tools.ts
// has one module-level terminal session, not one per concurrent agent run) --
// this app runs one agent task at a time, so this isn't a new concurrency
// model, just consistent with the existing one.

export interface PlanStep {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'done' | 'failed';
  // How many times this step has been marked in_progress. Used to give the
  // model (and the user, via the UI) real signal about whether a step is
  // stuck rather than just retried once and dropped.
  attempts: number;
}

let currentPlan: PlanStep[] = [];

export function setPlan(descriptions: string[]): PlanStep[] {
  currentPlan = descriptions.map((description, i) => ({
    id: `step_${i + 1}`,
    description,
    status: 'pending',
    attempts: 0
  }));
  return currentPlan;
}

export function getPlan(): PlanStep[] {
  return currentPlan;
}

export function updateStep(id: string, status: PlanStep['status']): PlanStep | null {
  const step = currentPlan.find((s) => s.id === id);
  if (!step) return null;
  if (status === 'in_progress') step.attempts += 1;
  step.status = status;
  return step;
}

export function clearPlan(): void {
  currentPlan = [];
}
