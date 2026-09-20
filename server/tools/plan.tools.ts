// server/tools/plan.tools.ts
//
// Gives the agent an explicit plan object instead of a flat, invisible
// sequence of tool calls. plan_set breaks the task into ordered steps up
// front; plan_update_step reports progress on each -- which is also the
// verify/recover mechanism: a step only becomes 'done' after the model
// says so (the system prompt requires this to follow an actual
// verification, e.g. a fresh screenshot), and a 'failed' step's response
// text carries its attempt count back to the model as a concrete nudge to
// try something different rather than repeating the same failed action.

import { registerTools } from './registry.js';
import { setPlan, updateStep, getPlan } from '../state/planState.js';

registerTools([
  {
    name: 'plan_set',
    description:
      'Break the task into 2-8 short, ordered, concrete steps and set this as the working plan. Call this ONCE, near the start, before taking any actions -- unless the task is genuinely one trivial step, in which case skip planning and just act. Replaces any existing plan.',
    parameters: {
      type: 'object',
      properties: {
        steps: {
          type: 'array',
          items: { type: 'string' },
          description: 'Ordered, concrete, independently-verifiable step descriptions.'
        }
      },
      required: ['steps']
    },
    tier: 'safe',
    handler: async (args) => {
      const steps = Array.isArray(args.steps) ? args.steps.filter((s: any) => typeof s === 'string' && s.trim()) : [];
      if (steps.length === 0) return { text: 'No valid steps provided -- plan not set.' };
      const plan = setPlan(steps);
      return {
        text: `Plan set with ${plan.length} step(s):\n${plan.map((s, i) => `${i + 1}. [${s.id}] ${s.description}`).join('\n')}`
      };
    }
  },
  {
    name: 'plan_update_step',
    description:
      "Update a plan step's status. Call with 'in_progress' when you start it. Call 'done' ONLY after verifying the expected result actually happened (e.g. a fresh screenshot confirming it, not just that an action ran without error) -- 'done' means verified, not attempted. Call 'failed' if a step genuinely can't be completed after a real attempt.",
    parameters: {
      type: 'object',
      properties: {
        step_id: { type: 'string', description: 'The step id, e.g. "step_1" (from plan_set\'s response).' },
        status: { type: 'string', enum: ['in_progress', 'done', 'failed'] }
      },
      required: ['step_id', 'status']
    },
    tier: 'safe',
    handler: async (args) => {
      const step = updateStep(args.step_id, args.status);
      if (!step) {
        return { text: `No plan step with id "${args.step_id}". Current plan: ${JSON.stringify(getPlan())}` };
      }

      if (step.status === 'failed') {
        // Recovery nudge grounded in real state (attempt count), not just
        // a hopeful instruction -- the model gets concrete signal about
        // whether this is the first miss or a repeated one.
        const note =
          step.attempts <= 1
            ? 'This was the first attempt at this step. Try a genuinely different approach before giving up on it -- a different tool, a different target, or re-checking your assumption about the current state with a fresh screenshot.'
            : `This step has now failed ${step.attempts} time(s). If you've already tried a different approach and it's still not working, it's reasonable to move on: explain what's blocking it in your final summary rather than repeating the same failed action.`;
        return { text: `Step ${step.id} marked failed. ${note}` };
      }

      return { text: `Step ${step.id} marked ${step.status}.` };
    }
  }
]);
