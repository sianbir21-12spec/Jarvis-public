// server/tools/vision.tools.ts
//
// The perception-layer gap: browser pages get exact structured targeting
// for free via browser_get_interactive_elements (real DOM, real selectors).
// Desktop apps have no DOM at all -- until now the only option there was
// desktop_screenshot + guessing raw pixel coordinates from what the model
// could see in the image.
//
// This adds the missing middle tier for desktop: send the screenshot to
// the same vision-capable model already used for the main agent loop, ask
// it to return structured {label, type, bounding box} JSON instead of
// prose, and hand that back to the agent -- plus draw it as labeled boxes
// via the existing ScreenshotAnnotation pipeline (AgentPanel.tsx already
// renders these, no frontend change needed).
//
// Deliberately NOT a real CV/ML pipeline (no OCR model, no UI-element
// classifier running locally) -- that's a much bigger, separate build.
// This is "ask the vision model to describe what it sees in a fixed
// schema" grounded against the actual image, which is a real, working
// improvement over raw-coordinate guessing without pretending to be more
// than it is.

import { registerTools } from './registry.js';
import * as desktop from './desktopControl.js';
import { fetchOmniRouteChat, OMNIROUTE_CONFIG } from '../omniroute.js';
import { getConfig } from '../runtimeConfig.js';
import type { ScreenshotAnnotation } from './registry.js';

function visionModel(): string {
  // Same model the main agent loop uses for reasoning over screenshots --
  // if it's good enough to drive the whole task, it's good enough for this.
  return getConfig('AGENT_MODEL') || OMNIROUTE_CONFIG.defaultModel;
}

interface DetectedElement {
  label: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const DETECTION_PROMPT = `Look at this screenshot of a desktop application. Identify every visible interactive UI element: buttons, text inputs, checkboxes, radio buttons, dropdowns, links, menu items, tabs, and dialog/window title bars.

Respond with ONLY a JSON array, no prose, no markdown code fence. Each element:
{"label": "short description of the element, e.g. 'Save button' or 'Username field'", "type": "button|input|checkbox|link|menuitem|tab|dialog|other", "x": <left edge, pixels>, "y": <top edge, pixels>, "w": <width, pixels>, "h": <height, pixels>}

Coordinates are pixels within THIS image as given (its actual width/height are provided below) -- not a percentage, not a different resolution. Be conservative: only include elements you can actually see and are reasonably confident about the location of. Cap it at the 25 most relevant/prominent elements if there are more than that on screen.`;

function extractJsonArray(raw: string): DetectedElement[] {
  // Models sometimes wrap JSON in a code fence despite instructions --
  // strip it rather than failing outright.
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error('Response was not a JSON array.');
  return parsed
    .filter((e) => e && typeof e.x === 'number' && typeof e.y === 'number')
    .map((e) => ({
      label: String(e.label || 'unlabeled'),
      type: String(e.type || 'other'),
      x: Number(e.x),
      y: Number(e.y),
      w: Number(e.w) || 0,
      h: Number(e.h) || 0
    }));
}

registerTools([
  {
    name: 'desktop_find_elements',
    description:
      "Take a fresh screenshot and analyze it for visible interactive UI elements (buttons, inputs, checkboxes, links, menu items, dialogs), returning each with a label, type, and pixel bounding box. Use this on desktop apps (no DOM available) INSTEAD of guessing coordinates from a raw desktop_screenshot -- it's the desktop equivalent of browser_get_interactive_elements. After calling this, use desktop_click/desktop_type with the center of the returned bounding box (x + w/2, y + h/2) rather than estimating from the image yourself. Slower and less exact than DOM selectors, so in the browser always prefer browser_get_interactive_elements instead -- use this only for genuine desktop apps.",
    parameters: {
      type: 'object',
      properties: {
        focus: {
          type: 'string',
          description: "Optional hint about what you're looking for (e.g. 'the Save button', 'the password field') to help on a busy/cluttered screen. Leave blank to detect everything relevant."
        }
      }
    },
    tier: 'safe', // read-only: captures + analyzes, no state change
    handler: async (args) => {
      const shot = await desktop.captureScreen();
      const focusLine = args?.focus ? `\n\nFocus especially on: ${args.focus}` : '';
      const prompt = `${DETECTION_PROMPT}\n\nImage dimensions: ${shot.width}x${shot.height} pixels.${focusLine}`;

      let elements: DetectedElement[];
      try {
        const gatewayResponse = await fetchOmniRouteChat({
          model: visionModel(),
          max_tokens: 2000,
          stream: false,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${shot.base64}` } }
              ]
            } as any
          ]
        });
        const data: any = await gatewayResponse.json();
        const text = data?.choices?.[0]?.message?.content || '';
        elements = extractJsonArray(text);
      } catch (err: any) {
        return {
          text: `Element detection failed (${err?.message || err}). Fall back to desktop_screenshot and estimating coordinates directly from the image.`,
          screenshot: shot
        };
      }

      if (elements.length === 0) {
        return { text: 'No interactive elements detected. Fall back to desktop_screenshot and estimating coordinates directly.', screenshot: shot };
      }

      const annotations: ScreenshotAnnotation[] = elements.map((e) => ({
        x: e.x,
        y: e.y,
        w: e.w || undefined,
        h: e.h || undefined,
        label: e.label
      }));

      return {
        text: JSON.stringify(elements, null, 2),
        screenshot: shot,
        annotations
      };
    }
  }
]);
