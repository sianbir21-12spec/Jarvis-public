// server/tools/file.tools.ts
//
// Structured filesystem tools for the agent. Before this file, the ONLY
// way the agent could touch the filesystem was shelling out via
// desktop_run_command/terminal_run -- workable, but not what section 6 of
// the spec asks for (file_search/read/write/create/edit/copy/move/delete,
// directory_list/create as first-class tools with their own tiering), and
// it meant every file op showed up in the timeline as an opaque PowerShell
// command rather than a legible "wrote report.txt to Documents" step.
//
// Reads/lists are SAFE. Anything that changes what's on disk (write,
// delete, move, copy-over-existing, mkdir) is ASK, in line with the
// permission-tier definitions in the brief ("modifying important files,
// destructive commands" = ASK). No BLOCK-tier here -- credential/secret
// handling stays out of file tools entirely; that's not this layer's job.

import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';
import os from 'os';
import { registerTools } from './registry.js';

// Expand a leading "~" the way a shell would, since the model naturally
// writes paths like "~/Documents/report.txt".
function resolvePath(p: string): string {
  if (p.startsWith('~')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return path.resolve(p);
}

const MAX_READ_BYTES = 500 * 1024; // keep huge files from blowing out the context window

registerTools([
  {
    name: 'file_read',
    description: 'Read a text file from disk and return its contents (truncated past ~500KB).',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    tier: 'safe',
    handler: async (args) => {
      const p = resolvePath(args.path);
      const stat = await fs.stat(p);
      if (stat.isDirectory()) {
        return { text: `"${args.path}" is a directory, not a file. Use file_list on it instead.` };
      }
      const buf = await fs.readFile(p);
      const truncated = buf.length > MAX_READ_BYTES;
      const text = buf.subarray(0, MAX_READ_BYTES).toString('utf8');
      return { text: truncated ? `${text}\n\n...[truncated, file is ${buf.length} bytes]` : text };
    }
  },
  {
    name: 'file_write',
    description: 'Write text to a file, creating it (and any missing parent directories) if it does not exist, or overwriting it if it does. Use file_read first if you need to preserve existing content.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path', 'content']
    },
    tier: 'ask',
    handler: async (args) => {
      const p = resolvePath(args.path);
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, args.content, 'utf8');
      // VERIFY, not just "the write call didn't throw": re-stat the file
      // and report the actual on-disk size so the agent (and the user
      // watching the timeline) get real confirmation, not an assumption.
      const stat = await fs.stat(p);
      return { text: `Wrote ${stat.size} bytes to ${p} (verified on disk).` };
    }
  },
  {
    name: 'file_list',
    description: 'List the contents of a directory (name, type, size).',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    tier: 'safe',
    handler: async (args) => {
      const p = resolvePath(args.path);
      const entries = await fs.readdir(p, { withFileTypes: true });
      const listing = await Promise.all(
        entries.map(async (e) => {
          const full = path.join(p, e.name);
          const isDir = e.isDirectory();
          let size: number | null = null;
          if (!isDir) {
            try {
              size = (await fs.stat(full)).size;
            } catch {
              size = null;
            }
          }
          return { name: e.name, type: isDir ? 'directory' : 'file', size };
        })
      );
      return { text: JSON.stringify(listing, null, 2) };
    }
  },
  {
    name: 'file_search',
    description: 'Recursively search a directory for files whose name matches a substring (case-insensitive). Capped at 200 results and a reasonable depth so it cannot hang on huge trees.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' }, query: { type: 'string' } },
      required: ['path', 'query']
    },
    tier: 'safe',
    handler: async (args) => {
      const root = resolvePath(args.path);
      const q = String(args.query).toLowerCase();
      const results: string[] = [];
      const MAX_RESULTS = 200;
      const MAX_DEPTH = 8;

      async function walk(dir: string, depth: number) {
        if (results.length >= MAX_RESULTS || depth > MAX_DEPTH) return;
        let entries: fssync.Dirent[];
        try {
          entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
          return; // permission-denied or similar -- skip, don't abort the whole search
        }
        for (const e of entries) {
          if (results.length >= MAX_RESULTS) return;
          const full = path.join(dir, e.name);
          if (e.name.toLowerCase().includes(q)) results.push(full);
          if (e.isDirectory()) await walk(full, depth + 1);
        }
      }

      await walk(root, 0);
      return {
        text: results.length
          ? JSON.stringify(results, null, 2)
          : `No files matching "${args.query}" found under ${root}.`
      };
    }
  },
  {
    name: 'file_delete',
    description: 'Delete a file (not a directory -- use with care, this is not recoverable).',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    tier: 'ask',
    handler: async (args) => {
      const p = resolvePath(args.path);
      const stat = await fs.stat(p);
      if (stat.isDirectory()) {
        return { text: `"${args.path}" is a directory. Refusing to delete via file_delete -- this tool only removes single files.` };
      }
      await fs.unlink(p);
      const stillExists = await fs.stat(p).then(() => true).catch(() => false);
      return { text: stillExists ? `Delete reported success but ${p} still exists -- verify manually.` : `Deleted ${p} (verified gone).` };
    }
  },
  {
    name: 'file_copy',
    description: 'Copy a file from one path to another, creating destination parent directories as needed.',
    parameters: {
      type: 'object',
      properties: { source: { type: 'string' }, destination: { type: 'string' } },
      required: ['source', 'destination']
    },
    tier: 'ask',
    handler: async (args) => {
      const src = resolvePath(args.source);
      const dest = resolvePath(args.destination);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(src, dest);
      const stat = await fs.stat(dest);
      return { text: `Copied to ${dest} (${stat.size} bytes, verified on disk).` };
    }
  },
  {
    name: 'file_move',
    description: 'Move (or rename) a file from one path to another, creating destination parent directories as needed.',
    parameters: {
      type: 'object',
      properties: { source: { type: 'string' }, destination: { type: 'string' } },
      required: ['source', 'destination']
    },
    tier: 'ask',
    handler: async (args) => {
      const src = resolvePath(args.source);
      const dest = resolvePath(args.destination);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.rename(src, dest);
      const exists = await fs.stat(dest).then(() => true).catch(() => false);
      return { text: exists ? `Moved to ${dest} (verified on disk).` : `Move reported success but ${dest} was not found -- verify manually.` };
    }
  },
  {
    name: 'directory_create',
    description: 'Create a directory, including any missing parent directories.',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    tier: 'ask',
    handler: async (args) => {
      const p = resolvePath(args.path);
      await fs.mkdir(p, { recursive: true });
      return { text: `Created directory ${p} (or it already existed).` };
    }
  },
  {
    name: 'file_exists',
    description: 'Check whether a file or directory exists at the given path -- use this to VERIFY a write/copy/move actually landed rather than assuming.',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    tier: 'safe',
    handler: async (args) => {
      const p = resolvePath(args.path);
      try {
        const stat = await fs.stat(p);
        return { text: `Exists: ${p} (${stat.isDirectory() ? 'directory' : `file, ${stat.size} bytes`})` };
      } catch {
        return { text: `Does not exist: ${p}` };
      }
    }
  }
]);
