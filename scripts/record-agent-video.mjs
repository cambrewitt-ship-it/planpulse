#!/usr/bin/env node
// Records a looping agent-demo route (see src/app/marketing/video/*) as an
// MP4 using headless Chromium (playwright-core) + system ffmpeg. The demo
// page sets `window.__resultShownAt` the moment its scripted "punchline"
// state renders (see HealthCheckAgentDemoStory.tsx); this script uses that
// to time the cut instead of guessing a fixed offset, so it stays correct
// if the scripted message timing ever changes.
//
// Usage:
//   node scripts/record-agent-video.mjs <path> <out-name> <width> <height> [holdMs]
//   node scripts/record-agent-video.mjs "/marketing/video/health-check?format=vertical" health-check-agent-vertical 1080 1920
//
// Requires: a system ffmpeg on PATH (brew install ffmpeg), the dev server
// running on localhost:3000, and playwright-core's Chromium already
// downloaded (npx playwright install chromium if ~/Library/Caches/ms-playwright
// has no chromium-* dir).

import { chromium } from 'playwright-core';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readdir } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';

const run = promisify(execFile);

// This playwright-core version defaults headless chromium.launch() to a
// separate "chromium_headless_shell" binary that isn't in the local browser
// cache (only the full "chromium-<rev>" build is). Point at that cached full
// build directly instead of re-downloading — it supports headless mode too.
async function findCachedChromiumExecutable() {
  const cacheDir = path.join(homedir(), 'Library/Caches/ms-playwright');
  const entries = await readdir(cacheDir).catch(() => []);
  const dir = entries.find((e) => /^chromium-\d+$/.test(e));
  if (!dir) return undefined;
  return path.join(cacheDir, dir, 'chrome-mac/Chromium.app/Contents/MacOS/Chromium');
}

const [, , routePath, outName, widthArg, heightArg, holdArg] = process.argv;

if (!routePath || !outName || !widthArg || !heightArg) {
  console.error('Usage: node scripts/record-agent-video.mjs <path> <out-name> <width> <height> [holdMs]');
  process.exit(1);
}

const width = Number(widthArg);
const height = Number(heightArg);
const holdMs = Number(holdArg ?? 3800);
const baseUrl = process.env.RECORD_BASE_URL ?? 'http://localhost:3000';
const outDir = path.resolve('public/videos');

async function main() {
  await mkdir(outDir, { recursive: true });
  const videoDir = await mkdtemp(path.join(tmpdir(), 'agent-video-'));

  const executablePath = await findCachedChromiumExecutable();
  const browser = await chromium.launch({ executablePath });
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    recordVideo: { dir: videoDir, size: { width, height } },
  });
  const page = await context.newPage();

  const navStart = Date.now();
  await page.goto(`${baseUrl}${routePath}`, { waitUntil: 'load' });

  try {
    await page.waitForFunction(() => Boolean(window.__resultShownAt), undefined, { timeout: 20000 });
  } catch {
    throw new Error('Timed out waiting for window.__resultShownAt — did the demo route load correctly?');
  }

  const resultShownAt = await page.evaluate(() => window.__resultShownAt);
  const cutAtMs = Number(resultShownAt) - navStart + holdMs;

  const remaining = cutAtMs - (Date.now() - navStart);
  if (remaining > 0) await page.waitForTimeout(remaining);

  const video = page.video();
  await context.close();
  await browser.close();

  const webmPath = await video.path();
  const cutSeconds = (cutAtMs / 1000).toFixed(2);

  const mp4Path = path.join(outDir, `${outName}.mp4`);
  await run('ffmpeg', [
    '-y',
    '-i', webmPath,
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-t', cutSeconds,
    '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0xFBF9F6`,
    '-c:v', 'libx264',
    '-profile:v', 'high',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '64k',
    mp4Path,
  ]);

  const posterPath = path.join(outDir, `${outName}-poster.jpg`);
  await run('ffmpeg', ['-y', '-ss', cutSeconds, '-i', mp4Path, '-frames:v', '1', posterPath]);

  console.log(`Wrote ${mp4Path} (cut at ${cutSeconds}s) and ${posterPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
