#!/usr/bin/env node
// Playwright check for <AstroPlayground> (compile-check only, no Run stage).
// Modelled on svelte-deep-dive's tools/svelte-playground.spec.mjs.
//
// Usage:
//   node tools/astro-playground.spec.mjs <baseUrl>
//   e.g. node tools/astro-playground.spec.mjs http://127.0.0.1:4951
//
// Plain script (no @playwright/test runner) — run with:
//   npx -p playwright node tools/astro-playground.spec.mjs <baseUrl>
//
// What it checks, per lesson page (EN and TH), for the two embedding lessons:
//   1. Navigate to the lesson, wait for the AstroPlayground's Compile button.
//   2. Click Compile — assert the output panel contains a real compiler
//      marker (`$$createComponent` for both; the styles-and-scripts sample
//      also asserts a `data-astro-cid-` scoped-style attribute appears) and
//      that the version badge shows non-empty "@astrojs/compiler" text.
//   3. For the syntax-deep sample (set:html with children): assert the
//      diagnostics panel shows the real warning text.
//   4. Assert zero page-level console errors accumulated across the flow.

import { chromium } from 'playwright';

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error('Usage: node tools/astro-playground.spec.mjs <baseUrl>');
  process.exit(1);
}

const LESSONS = [
  {
    path: '/astro/en/components/astro-syntax-deep/',
    outputMarker: '$$createComponent',
    diagMarker: 'set:html directive will overwrite child nodes',
  },
  {
    path: '/astro/th/components/astro-syntax-deep/',
    outputMarker: '$$createComponent',
    diagMarker: 'set:html directive will overwrite child nodes',
  },
  {
    path: '/astro/en/components/styles-and-scripts/',
    outputMarker: 'data-astro-cid-',
  },
  {
    path: '/astro/th/components/styles-and-scripts/',
    outputMarker: 'data-astro-cid-',
  },
];

async function checkLesson(browser, { path, outputMarker, diagMarker }) {
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  const url = baseUrl.replace(/\/$/, '') + path;
  await page.goto(url, { waitUntil: 'load' });

  const compileBtn = page.locator('.ap__compile').first();
  await compileBtn.waitFor({ state: 'visible', timeout: 15000 });
  await compileBtn.click();

  const outCode = page.locator('.ap__out pre code').first();
  await outCode.waitFor({ state: 'visible', timeout: 20000 });
  const outputText = (await outCode.textContent()) ?? '';
  if (!outputText.includes(outputMarker)) {
    throw new Error(`${path}: compiled output missing marker "${outputMarker}" — got: ${outputText.slice(0, 200)}`);
  }

  const badgeText = (await page.locator('.ap__badge').first().textContent())?.trim() ?? '';
  if (!/@astrojs\/compiler/.test(badgeText)) {
    throw new Error(`${path}: version badge missing "@astrojs/compiler" text: "${badgeText}"`);
  }

  if (diagMarker) {
    const diagText = (await page.locator('.ap__diag').first().textContent()) ?? '';
    if (!diagText.includes(diagMarker)) {
      throw new Error(`${path}: diagnostics panel missing "${diagMarker}" — got: ${diagText.slice(0, 300)}`);
    }
  }

  if (consoleErrors.length) {
    throw new Error(`${path}: ${consoleErrors.length} console error(s): ${consoleErrors.join(' | ')}`);
  }

  await page.close();
  return { path, badgeText };
}

async function main() {
  const browser = await chromium.launch();
  const results = [];
  let failed = false;
  for (const lesson of LESSONS) {
    try {
      const result = await checkLesson(browser, lesson);
      results.push(result);
      console.log(`PASS  ${lesson.path}`);
      console.log(`      badge: ${result.badgeText}`);
    } catch (err) {
      failed = true;
      console.log(`FAIL  ${lesson.path}`);
      console.log(`      ${err.message}`);
    }
  }
  await browser.close();
  console.log(`\n${results.length}/${LESSONS.length} lesson(s) passed.`);
  process.exit(failed ? 1 : 0);
}

main();
