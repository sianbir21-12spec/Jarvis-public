import fs from 'fs';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Runtime configuration store.
 *
 * Previously every credential was read straight from process.env, which meant
 * the only way to configure the app was to hand-edit a .env file sitting next
 * to the source. That does not survive being packaged into a Windows .exe --
 * an installed app has no .env to edit.
 *
 * This module layers a user-editable JSON file on top of the environment:
 *
 *   stored value  ->  process.env value  ->  built-in default
 *
 * The file lives in the Electron userData directory (passed in as
 * JARVIS_CONFIG_DIR by electron/main.cjs) so it persists across app updates
 * and is per-user.
 */

export interface RuntimeConfig {
  OMNIROUTE_API_KEY: string;
  OMNIROUTE_BASE_URL: string;
  OMNIROUTE_MODEL: string;
  AGENT_MODEL: string;
  // Retried once, automatically, when the primary AGENT_MODEL/OMNIROUTE_MODEL
  // call fails with something that looks like an outage (5xx or a step
  // timeout) -- see callGatewayWithFallback() in agentLoop.ts. Empty string
  // (the default) means "no fallback configured", not "use the default
  // model" -- an outage just surfaces as an error, same as before this
  // existed.
  AGENT_FALLBACK_MODEL: string;
  OMNIROUTE_STT_MODEL: string;
  GEMINI_API_KEY: string;
  GEMINI_STT_MODEL: string;
}

export const CONFIG_DEFAULTS: RuntimeConfig = {
  OMNIROUTE_API_KEY: '',
  OMNIROUTE_BASE_URL: 'https://omnirouuter.zeabur.app',
  OMNIROUTE_MODEL: 'SIAN',
  AGENT_MODEL: '',
  AGENT_FALLBACK_MODEL: '',
  OMNIROUTE_STT_MODEL: 'whisper-1',
  GEMINI_API_KEY: '',
  GEMINI_STT_MODEL: 'gemini-3.6-flash'
};

/** Keys that hold secrets and must never be sent back to the renderer in full. */
export const SECRET_KEYS: (keyof RuntimeConfig)[] = ['OMNIROUTE_API_KEY', 'GEMINI_API_KEY'];

const CONFIG_KEYS = Object.keys(CONFIG_DEFAULTS) as (keyof RuntimeConfig)[];

function configDir(): string {
  if (process.env.JARVIS_CONFIG_DIR) return process.env.JARVIS_CONFIG_DIR;
  // Fallback for `npm run dev` / plain `node dist/server.cjs` outside Electron.
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'jarvis-desktop');
  }
  return path.join(os.homedir(), '.jarvis-desktop');
}

function configPath(): string {
  return path.join(configDir(), 'config.json');
}

let cache: Partial<RuntimeConfig> | null = null;

function load(): Partial<RuntimeConfig> {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    const parsed = JSON.parse(raw);
    const clean: Partial<RuntimeConfig> = {};
    for (const key of CONFIG_KEYS) {
      if (typeof parsed?.[key] === 'string') clean[key] = parsed[key];
    }
    cache = clean;
  } catch {
    // Missing or corrupt file is fine -- fall back to env/defaults.
    cache = {};
  }
  return cache;
}

/**
 * Resolve a single config value: stored -> env -> default.
 * Blank strings are treated as "not set" so clearing a field in the UI
 * falls back to the environment rather than sending an empty API key.
 */
export function getConfig(key: keyof RuntimeConfig): string {
  const stored = load()[key];
  if (typeof stored === 'string' && stored.trim() !== '') return stored.trim();

  const fromEnv = process.env[key];
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv.trim();

  return CONFIG_DEFAULTS[key];
}

/** True when a value came from the stored file rather than env/defaults. */
export function isStored(key: keyof RuntimeConfig): boolean {
  const stored = load()[key];
  return typeof stored === 'string' && stored.trim() !== '';
}

/** Merge a partial update into the stored config and persist it to disk. */
export function updateConfig(patch: Partial<Record<keyof RuntimeConfig, unknown>>): void {
  const current = { ...load() };

  for (const key of CONFIG_KEYS) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (value === null) {
      delete current[key];
      continue;
    }
    if (typeof value !== 'string') continue;
    if (value.trim() === '') {
      delete current[key];
    } else {
      current[key] = value.trim();
    }
  }

  const dir = configDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = configPath();
  fs.writeFileSync(file, JSON.stringify(current, null, 2), 'utf8');

  // Best-effort: keep the credentials file readable only by the owner.
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* not supported on some Windows filesystems -- non-fatal */
  }

  cache = current;
}

/** Mask a secret for display, e.g. "sk-abcd...wxyz". */
function maskSecret(value: string): string {
  if (!value) return '';
  if (value.length <= 8) return '*'.repeat(value.length);
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

/**
 * Safe view of the config for the renderer. Secrets are replaced with a mask
 * plus a boolean so the UI can show "configured" without ever holding the key.
 */
export function getPublicConfig() {
  const out: Record<string, unknown> = {};

  for (const key of CONFIG_KEYS) {
    const value = getConfig(key);
    if (SECRET_KEYS.includes(key)) {
      out[key] = maskSecret(value);
      out[`${key}_SET`] = value !== '';
    } else {
      out[key] = value;
    }
    out[`${key}_SOURCE`] = isStored(key) ? 'app' : process.env[key]?.trim() ? 'env' : 'default';
  }

  out.configPath = configPath();
  return out;
}
