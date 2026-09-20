// server/tools/browserControl.ts
//
// Browser automation via Playwright, driving the machine's installed Chrome
// (channel: 'chrome') in a dedicated automation profile -- a real, visible
// browser window the agent can navigate/click/type in. Separate from
// Electron's own UI webview entirely.
//
// Requires (added to package.json): playwright
// First-time setup: `npx playwright install chrome` (only needed if Chrome
// isn't already installed system-wide; if it is, Playwright reuses it).

import path from 'path';
import os from 'os';
import type { Browser, BrowserContext, Page } from 'playwright';

let context: BrowserContext | null = null;
let pages: Page[] = [];
let activePageIndex = 0;

async function ensureContext(): Promise<BrowserContext> {
  if (context) return context;
  const { chromium } = await import('playwright');
  const userDataDir = path.join(os.homedir(), '.jarvis-desktop', 'browser-profile');

  context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: ['--start-maximized']
  });

  context.on('page', (page) => {
    pages.push(page);
  });

  pages = context.pages();
  if (pages.length === 0) {
    pages.push(await context.newPage());
  }
  activePageIndex = 0;

  context.on('close', () => {
    context = null;
    pages = [];
  });

  return context;
}

async function activePage(): Promise<Page> {
  await ensureContext();
  pages = pages.filter((p) => !p.isClosed());
  if (pages.length === 0) {
    const ctx = await ensureContext();
    pages.push(await ctx.newPage());
  }
  if (activePageIndex >= pages.length) activePageIndex = 0;
  return pages[activePageIndex];
}

export async function launchBrowser(): Promise<{ ok: true }> {
  await ensureContext();
  return { ok: true };
}

export async function closeBrowser(): Promise<void> {
  if (context) {
    await context.close();
    context = null;
    pages = [];
  }
}

export async function navigate(url: string): Promise<{ url: string; title: string }> {
  const page = await activePage();
  const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
  return { url: page.url(), title: await page.title() };
}

export async function goBack() {
  const page = await activePage();
  await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
}

export async function goForward() {
  const page = await activePage();
  await page.goForward({ waitUntil: 'domcontentloaded' }).catch(() => {});
}

export async function reload() {
  const page = await activePage();
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
}

export async function screenshot(maxWidth = 1280): Promise<{ base64: string; width: number; height: number; scale: number }> {
  const page = await activePage();
  const buffer = await page.screenshot({ type: 'jpeg', quality: 75 });
  const sharp = (await import('sharp')).default;
  const meta = await sharp(buffer).metadata();
  const width = meta.width || 1280;
  const scale = width > maxWidth ? maxWidth / width : 1;
  const resized = scale < 1 ? await sharp(buffer).resize(Math.round(width * scale)).jpeg({ quality: 75 }).toBuffer() : buffer;
  const outMeta = await sharp(resized).metadata();
  // `scale` is exposed so callers that measured an element's bounding box
  // in the page's own (pre-resize) pixel space -- e.g. clickSelector's
  // boundingBox() -- can convert it into this screenshot's pixel space for
  // annotation purposes. 1 when the page wasn't downscaled.
  return { base64: resized.toString('base64'), width: outMeta.width || width, height: outMeta.height || 0, scale };
}

export async function clickSelector(selector: string): Promise<void> {
  const page = await activePage();
  await page.click(selector, { timeout: 10000 });
}

export async function clickCoordinates(x: number, y: number): Promise<void> {
  const page = await activePage();
  await page.mouse.click(x, y);
}

export async function typeIntoSelector(selector: string, text: string, clearFirst = true): Promise<void> {
  const page = await activePage();
  const el = page.locator(selector).first();
  await el.waitFor({ timeout: 10000 });
  if (clearFirst) await el.fill('');
  await el.type(text, { delay: 15 });
}

export async function typeAtCursor(text: string): Promise<void> {
  const page = await activePage();
  await page.keyboard.type(text, { delay: 15 });
}

export async function pressKey(key: string): Promise<void> {
  const page = await activePage();
  await page.keyboard.press(key);
}

export async function scroll(deltaX: number, deltaY: number): Promise<void> {
  const page = await activePage();
  await page.mouse.wheel(deltaX, deltaY);
}

export async function getPageText(): Promise<string> {
  const page = await activePage();
  const text = await page.evaluate(() => document.body?.innerText || '');
  return text.slice(0, 12000);
}

export async function getInteractiveElements(): Promise<Array<{ tag: string; text: string; selector: string }>> {
  const page = await activePage();
  return page.evaluate(() => {
    const els = Array.from(
      document.querySelectorAll('a, button, input, textarea, select, [role="button"]')
    ).slice(0, 150);
    return els.map((el, i) => {
      const tag = el.tagName.toLowerCase();
      const text = (el.textContent || (el as HTMLInputElement).placeholder || '').trim().slice(0, 60);
      if (!el.id) el.setAttribute('data-jarvis-idx', String(i));
      const selector = el.id ? `#${el.id}` : `[data-jarvis-idx="${i}"]`;
      return { tag, text, selector };
    });
  });
}

export async function evaluateScript(script: string): Promise<any> {
  const page = await activePage();
  // Playwright accepts a raw expression/function body string directly.
  const result = await page.evaluate(script as any);
  return result;
}

export async function listTabs(): Promise<Array<{ index: number; title: string; url: string; active: boolean }>> {
  await ensureContext();
  pages = pages.filter((p) => !p.isClosed());
  return Promise.all(
    pages.map(async (p, i) => ({
      index: i,
      title: await p.title().catch(() => ''),
      url: p.url(),
      active: i === activePageIndex
    }))
  );
}

export async function newTab(url?: string): Promise<{ index: number }> {
  const ctx = await ensureContext();
  const page = await ctx.newPage();
  pages.push(page);
  activePageIndex = pages.length - 1;
  if (url) await navigate(url);
  return { index: activePageIndex };
}

export async function switchTab(index: number): Promise<void> {
  pages = pages.filter((p) => !p.isClosed());
  if (index < 0 || index >= pages.length) throw new Error(`No tab at index ${index}`);
  activePageIndex = index;
  await pages[index].bringToFront();
}

export async function closeTab(index: number): Promise<void> {
  pages = pages.filter((p) => !p.isClosed());
  if (index < 0 || index >= pages.length) throw new Error(`No tab at index ${index}`);
  await pages[index].close();
  pages.splice(index, 1);
  if (activePageIndex >= pages.length) activePageIndex = Math.max(0, pages.length - 1);
}
