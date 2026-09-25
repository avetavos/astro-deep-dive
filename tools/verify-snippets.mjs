#!/usr/bin/env node
// Snippet-verification harness for the bilingual Astro Deep Dive course.
//
// This course is ABOUT Astro 7 and the site itself IS Astro 7.3.5 + Starlight
// — unlike the svelte/react/nextjs sibling courses, there's no framework
// mismatch, but there's still no in-browser playground, so the only way to
// prove a lesson's code snippets actually compile (and, for a real page,
// actually build/route) is a real Astro project ("the probe", tools/probe/,
// gitignored) plus `astro check` (fast, every fence) and `astro build`
// (slower, one lesson at a time, for build-level claims — hybrid rendering,
// actions, middleware, adapters).
//
// Adapted from svelte-deep-dive/tools/verify-snippets.mjs (closest match:
// HTML-comment path lines, a real route tree under the probe's own
// src/pages/, --test via vitest, --self-test, --refresh installing test
// deps) and nextjs-deep-dive/tools/verify-snippets.mjs (the `@/`-alias
// rewrite-at-write-time pattern, reused here for a documented `@/ -> src/`
// convention). The quiz-array/SpotTheBug-aware string scanner
// (parseStringAt/scanBalanced) is ported from this repo's own
// tools/check-parity.mjs.
//
// Usage:
//   node tools/verify-snippets.mjs                 astro check every collected
//                                                   fence from src/content/docs/en
//   node tools/verify-snippets.mjs --refresh        wipe + rescaffold tools/probe first
//   node tools/verify-snippets.mjs --strict         also fail (exit 1) on warnings
//   node tools/verify-snippets.mjs --build <module>/<lesson>
//                                                   real `astro build` with one lesson's
//                                                   fences dropped at their real probe path
//   node tools/verify-snippets.mjs --test [module/lesson]
//                                                   run vitest over collected *.test.ts
//                                                   fences (all, or one lesson's namespace)
//   node tools/verify-snippets.mjs --self-test      harness self-check (see selfTest())
//
// Fence convention (spec §1/§5): an `astro` fence whose FIRST line is
// `<!-- <path> -->` with path ending `.astro` is a real component/page. A
// `ts`/`js`/`mjs` fence whose first line is `// <path>` ending `.ts`/`.js`/
// `.mjs` (this also matches `.test.ts` and `astro.config.mjs`) is a real
// module. Either path line may carry a trailing ` — comment` after the path
// itself (seen already in the real corpus, e.g. `// astro.config.mjs —
// enabling on-demand rendering on Cloudflare`) — tolerated, not required.
// A first line containing `@expect-error` is a deliberate-error demo and is
// skipped (the lesson prose carries the real error). Anything else is a
// fragment with no path comment and is skipped.
//
// SECOND accepted `astro`-fence convention, found already in ~11 places in
// the real corpus and not in the original spec wording: a real `.astro`
// file almost always starts with `---` (its own frontmatter fence), which
// leaves nowhere for an HTML comment to sit before it without changing what
// the reader sees rendered. The corpus's actual practice is to put the path
// comment as a plain `//` comment on the FIRST LINE INSIDE the frontmatter
// instead:
//
//   ```astro
//   ---
//   // src/components/Card.astro
//   interface Props { ... }
//   ---
//   <div>...</div>
//   ```
//
// This harness accepts BOTH forms (see collectFences below) — the `---`
// form is if anything more natural for a real file (harmless, valid
// frontmatter start; the whole fence is written out verbatim either way,
// path-comment line kept, per spec). Documented here per spec's own request
// to "decide and document"; see README's Harness section too.
//
// IMPORTANT correctness finding (verified against the installed
// astro@7.3.5 compiler directly, not assumed): the spec's PRIMARY
// convention — `<!-- path -->` on line 1, THEN a real `---` frontmatter
// block starting on line 2 — does not actually work for any component that
// has frontmatter. Astro's compiler only recognizes a `---` block as
// frontmatter when it is the file's own first line; with a comment above
// it, the `---` lines are silently NOT treated as frontmatter, so
// script-section identifiers become unresolved globals in the template
// (verified: `astro check` reports `Cannot find name 'x'` at the template
// usage, not the real type error at its declaration). The `<!-- path -->`
// convention only produces correct diagnostics for a frontmatter-LESS
// component (pure markup/slots, no script section) — confirmed clean
// against the same probe. The `---` / `// path` form has no such problem
// (the comment is a normal, harmless statement INSIDE real frontmatter).
// Net effect: this harness still faithfully collects and checks fences
// written the primary way (so a real mistake still fails `astro check`,
// just sometimes under a confusing diagnostic message), but authors of new
// Phase 3/4 lessons should be told to prefer the `---` / `// path` form for
// any component with a script section, and reserve the literal
// `<!-- path -->` form for frontmatter-less fragments only. Flagged in this
// harness's own final report; not something this script can silently "fix"
// (it would mean rewriting the fence's own first line, which changes what
// the reader sees rendered in the lesson).
//
// Path-comment line: KEPT, not stripped, in every fence — inert either way
// (HTML comment / `//` comment), and re-deriving line numbers for
// diagnostics would need it stripped-with-newline-preserved for zero
// benefit (same choice the sibling courses' harnesses make).
//
// Namespacing: a collected fence is written into
// `tools/probe/src/lessons/<module>__<lesson>/<path-without-leading-'src/'>`
// — e.g. `src/lib/format.ts` in lesson `content-and-data/data-fetching`
// lands at `src/lessons/content-and-data__data-fetching/lib/format.ts`.
// `src/pages/**` fences are the one exception: they land under the probe's
// REAL `src/pages/__lessons/<ns>/<rest-after-pages/>` tree instead, so
// Astro's own file-based router discovers them as real (never-linked,
// harmless) routes and `astro sync` generates real per-route types. Astro
// does not special-case a leading-underscore directory — `__lessons` is an
// ordinary route segment, just never linked to and never included in
// `--build` (which only ever builds ONE lesson's own routes at their real
// position, see buildMode below).
//
// Special singleton files — a lesson's own `src/content.config.ts`,
// `src/middleware.ts`, `src/actions/index.ts`, `astro.config.mjs`,
// `src/live.config.ts`, `src/env.d.ts` — can't coexist across lessons at
// their real, singular project position (every lesson would collide on the
// same path). In default (check) mode they need NO special-casing at all:
// the generic "non-`src/pages` path -> src/lessons/<ns>/<rest>" rule
// already namespaces them like any other file, so they type-check as plain
// modules. `astro:content` / `astro:actions` / `astro:middleware` /
// `astro:env` still resolve from ANY location in the program, because Astro
// ships static ambient fallback declarations for all four
// (node_modules/astro/types/{content,actions,env}.d.ts, `astro:middleware`
// directly in node_modules/astro/client.d.ts) referenced unconditionally
// from client.d.ts, which `.astro/types.d.ts` references — verified by
// inspecting the installed astro@7.3.5 package directly (see README). Only
// `--build <module>/<lesson>` needs real positions: it writes EVERY
// collected fence of that one lesson straight to its real `path` under
// tools/probe/ (backing up/restoring whatever was there), so a lesson's own
// content.config.ts/middleware.ts/actions/astro.config.mjs are the live
// ones for that one real `astro build` — the only way to prove e.g. a
// content collection's schema actually matches its own lesson's frontmatter,
// or that `sequence()` in a lesson's own middleware actually loads.
//
// `@/`-style imports: this course's corpus does not use a `@/` alias today
// (checked: zero occurrences), but the spec asks this harness to resolve
// them if a future lesson does. Documented convention: `@/x` means
// `src/x` (the common Astro/Vite project convention), same as a relative
// import — resolved via the owners map (own lesson first, else the first
// lesson in module/file order that defines that exact `src/...` path) and
// rewritten to a relative path into the owner's namespace dir. Relative
// (`./`, `../`) and `@/` specifiers referencing another fence MUST carry
// the real extension (`.astro`, `.ts`, `.js`, `.mjs`) — an extensionless
// specifier is left untouched and surfaces astro check's own "cannot find
// module" error, which is the honest outcome for a snippet that doesn't
// spell out what it imports.

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, mkdtempSync, globSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const PROBE_DIR = path.join(REPO_ROOT, 'tools/probe');
const LESSONS_DIR = path.join(PROBE_DIR, 'src/lessons');
const PAGE_LESSONS_DIR = path.join(PROBE_DIR, 'src/pages/__lessons');
const DOCS_EN = path.join(REPO_ROOT, 'src/content/docs/en');
const ASTRO_BIN = path.join(PROBE_DIR, 'node_modules/.bin/astro');
const VITEST_BIN = path.join(PROBE_DIR, 'node_modules/.bin/vitest');

const FENCE_LANGS = new Set(['astro', 'ts', 'js', 'mjs']);

// Path token shared by both `.astro` conventions: must start `src/` (every
// real example in the spec and the corpus does — a bare `Foo.astro` with no
// `src/` prefix, seen once in the corpus as a template FRAGMENT with no
// frontmatter, is deliberately not collectible).
const ASTRO_TOKEN = String.raw`src\/[\w@.\-[\]()/]+\.astro`;
const ASTRO_HTML_PATH_RE = new RegExp(`^<!-- (${ASTRO_TOKEN})(?:\\s+\\S.*)? -->$`);
const ASTRO_FM_PATH_RE = new RegExp(`^\\/\\/ (${ASTRO_TOKEN})(?:\\s+\\S.*)?$`);
// ts/js/mjs: `src/...` OR the one repo-root exception `astro.config.mjs`.
const TSJSMJS_TOKEN = String.raw`src\/[\w@.\-[\]()/]+\.(?:ts|js|mjs)|astro\.config\.mjs`;
const TSJSMJS_PATH_RE = new RegExp(`^\\/\\/ (${TSJSMJS_TOKEN})(?:\\s+\\S.*)?$`);

// Generated, harness-owned probe files — see file-header note on why the
// probe needs `output: 'static'` + the node adapter (standalone) and a
// getViteConfig-based vitest config.
const ASTRO_CONFIG_SRC = `// @ts-check
// Generated by tools/verify-snippets.mjs — safe to regenerate, do not hand-edit.
//
// output: 'static' + adapter: node({ mode: 'standalone' }) lets a lesson
// fence flip \`export const prerender = false\` on an individual page
// (hybrid-style per-page opt-out of static) while the probe still builds —
// matching how the real course site (and Astro's own "hybrid" legacy term)
// works. 'standalone' (not 'middleware') so --build can run the emitted
// server directly if a lesson needs a real curl-against-it check later.
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  output: 'static',
  adapter: node({ mode: 'standalone' }),
});
`;

const VITEST_CONFIG_SRC = `/// <reference types="vitest/config" />
// Generated by tools/verify-snippets.mjs — safe to regenerate, do not hand-edit.
//
// getViteConfig (from astro/config, verified present in the installed
// astro@7.3.5's dist/config/index.d.ts) builds the same Vite environment
// Astro itself uses (virtual modules, astro:content, the content-layer
// plugin, etc.), so a lesson *.test.ts fence can:
//   import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// and render a real .astro component (import path verified against
// node_modules/astro/dist/container/index.d.ts). The container API returns
// a plain HTML string, so no jsdom/testing-library is needed here — no new
// repo dependency. The triple-slash reference above is required — without
// it the test option below doesn't type-check against getViteConfig's plain
// Vite UserConfig return type (caught by this harness's own --self-test,
// which failed with a spurious "unmapped" ts(2353) on this exact file until
// this reference was added).
import { getViteConfig } from 'astro/config';

export default getViteConfig({
  test: {
    include: ['src/lessons/**/*.test.ts', 'src/pages/__lessons/**/*.test.ts'],
  },
});
`;

// ---------------------------------------------------------------------------
// String/bracket scanning helpers, ported from tools/check-parity.mjs (same
// technique that file uses to keep quiz-array template literals and
// `<SpotTheBug code={\`...\`}>` props from confusing a naive fence regex:
// walk the source honoring string literals so brackets/backticks *inside* a
// string never look like real structure).
// ---------------------------------------------------------------------------

function parseStringAt(text, i) {
  const quote = text[i];
  let j = i + 1;
  while (j < text.length) {
    const c = text[j];
    if (c === '\\') {
      j += 2;
      continue;
    }
    if (c === quote) {
      j++;
      break;
    }
    j++;
  }
  return { end: j };
}

function scanBalanced(text, start, open, close) {
  let depth = 1;
  let i = start;
  while (i < text.length && depth > 0) {
    const c = text[i];
    if (c === '"' || c === "'" || c === '`') {
      i = parseStringAt(text, i).end;
      continue;
    }
    if (c === open) depth++;
    else if (c === close) depth--;
    i++;
  }
  return i; // index right after the matching close
}

// Ranges of `export const xxx = [ ... ]` (quiz question arrays) and
// `<SpotTheBug code={\` ... \`}>` template literals — the only places a
// fence-looking ``` sequence can hide inside a string in this course.
function findExcludedRanges(src) {
  const ranges = [];
  {
    const re = /export\s+const\s+\w+\s*=\s*\[/g;
    let m;
    while ((m = re.exec(src))) {
      const end = scanBalanced(src, re.lastIndex, '[', ']');
      ranges.push([m.index, end]);
      re.lastIndex = end;
    }
  }
  {
    const re = /<SpotTheBug\s+code=\{\s*`/g;
    let m;
    while ((m = re.exec(src))) {
      const backtickIdx = m.index + m[0].length - 1;
      const { end } = parseStringAt(src, backtickIdx);
      ranges.push([m.index, end]);
      re.lastIndex = end;
    }
  }
  return ranges;
}

// Blank out excluded ranges but keep every newline they contain, so line
// numbers computed on the result still match the original file.
function stripExcluded(src, ranges) {
  if (!ranges.length) return src;
  ranges.sort((a, b) => a[0] - b[0]);
  let out = '';
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start < cursor) continue; // overlapping/malformed match, ignore
    out += src.slice(cursor, start);
    out += src.slice(start, end).replace(/[^\n]/g, '');
    cursor = end;
  }
  out += src.slice(cursor);
  return out;
}

function countNewlinesBefore(s, upto) {
  let n = 0;
  for (let i = 0; i < upto; i++) if (s.charCodeAt(i) === 10) n++;
  return n;
}

// Collect every fenced code block in one MDX file's source.
// Returns [{ fenceNum, lang, line, category, path?, body? }], fenceNum is
// 1-based over ALL real fences (any language) in document order.
function collectFences(rawSrc) {
  const src = stripExcluded(rawSrc, findExcludedRanges(rawSrc));
  const fenceRe = /```([\w-]*)[^\n]*\n([\s\S]*?)```/g;
  const results = [];
  let fenceNum = 0;
  let m;
  while ((m = fenceRe.exec(src))) {
    fenceNum++;
    const lang = m[1];
    if (!FENCE_LANGS.has(lang)) continue; // out of scope for this harness
    const body = m[2];
    const line = countNewlinesBefore(src, m.index) + 1;
    const lines = body.split('\n');
    const firstLine = lines[0].trim();

    // Astro's second accepted convention: path comment inside frontmatter.
    if (lang === 'astro' && firstLine === '---') {
      const secondLine = (lines[1] ?? '').trim();
      if (secondLine.includes('@expect-error')) {
        results.push({ fenceNum, lang, line, category: 'expect-error' });
        continue;
      }
      const fm = ASTRO_FM_PATH_RE.exec(secondLine);
      if (fm) {
        results.push({ fenceNum, lang, line, category: 'collected', path: fm[1], body });
      } else {
        results.push({ fenceNum, lang, line, category: 'skipped-no-path' });
      }
      continue;
    }

    if (firstLine.includes('@expect-error')) {
      results.push({ fenceNum, lang, line, category: 'expect-error' });
      continue;
    }
    const pathRe = lang === 'astro' ? ASTRO_HTML_PATH_RE : TSJSMJS_PATH_RE;
    const pm = pathRe.exec(firstLine);
    if (pm) {
      results.push({ fenceNum, lang, line, category: 'collected', path: pm[1], body });
    } else {
      results.push({ fenceNum, lang, line, category: 'skipped-no-path' });
    }
  }
  return results;
}

// Where a collected fence's original `src/...` (or root `astro.config.mjs`)
// path lands inside the probe. `src/pages/**` is the one exception (real
// routes, see file-header note); everything else — INCLUDING the special
// singleton files — lands under the inert `src/lessons/<ns>/` tree, which
// needs no special-casing in default (check) mode.
function destRelPath(ns, srcPath) {
  if (srcPath.startsWith('src/pages/')) {
    return path.posix.join('src/pages/__lessons', ns, srcPath.slice('src/pages/'.length));
  }
  if (srcPath.startsWith('src/')) {
    return path.posix.join('src/lessons', ns, srcPath.slice('src/'.length));
  }
  return path.posix.join('src/lessons', ns, srcPath); // astro.config.mjs
}

// Resolve a `./x`, `../x`, or `@/x` specifier (found inside a fence
// originally at `fenceSrcPath`) to the `src/...`-rooted path it names —
// exactly the string used as the fence's own `path` / owners-map key
// (specifiers are required to carry their real extension, see file-header
// note). `@/` is documented to mean `src/`.
function resolveSpecifier(spec, fenceSrcPath) {
  if (spec.startsWith('@/')) return 'src/' + spec.slice(2);
  const dir = path.posix.dirname(fenceSrcPath);
  return path.posix.normalize(path.posix.join(dir, spec));
}

// Rewrite `./x`, `../x`, and `@/x` specifiers (real extension required)
// into a relative path rooted at the resolved owner lesson's own namespace
// dir — own lesson first, else the first lesson (module/file order) that
// defines that exact path. An unresolvable specifier is left untouched, so
// astro check's own "cannot find module" error surfaces for it.
function rewriteSpecifiers(body, fenceSrcPath, ns, owners, ownKeys) {
  const hereDir = path.posix.dirname(destRelPath(ns, fenceSrcPath));
  return body.replace(
    /\b(from|import|require)(\s*\(?\s*)(['"])(\.\.?\/[^'"]*\.(?:astro|ts|js|mjs)|@\/[^'"]*\.(?:astro|ts|js|mjs))\3/g,
    (whole, kw, ws, q, spec) => {
      const key = resolveSpecifier(spec, fenceSrcPath);
      const ownerNs = ownKeys.has(key) ? ns : owners.get(key)?.[0];
      if (!ownerNs) return whole;
      let rel = path.posix.relative(hereDir, destRelPath(ownerNs, key));
      if (!rel.startsWith('.')) rel = `./${rel}`;
      return `${kw}${ws}${q}${rel}${q}`;
    },
  );
}

// ---------------------------------------------------------------------------
// Probe lifecycle
// ---------------------------------------------------------------------------

function ensureProbe(refresh) {
  if (refresh && existsSync(PROBE_DIR)) rmSync(PROBE_DIR, { recursive: true, force: true });
  if (!existsSync(PROBE_DIR)) {
    console.log('tools/probe missing — scaffolding with `npm create astro@latest` (minimal, ts strict)...');
    const create = spawnSync(
      'npm',
      [
        'create',
        'astro@latest',
        'probe',
        '--',
        '--template',
        'minimal',
        '--typescript',
        'strict',
        '--no-install',
        '--no-git',
        '--skip-houston',
        '--yes',
      ],
      { cwd: path.join(REPO_ROOT, 'tools'), stdio: 'inherit' },
    );
    if (create.status !== 0) {
      console.error('probe scaffold failed');
      process.exit(1);
    }
    rmSync(path.join(PROBE_DIR, '.git'), { recursive: true, force: true }); // --no-git already skips this; belt & suspenders
    const install = spawnSync('npm', ['install'], { cwd: PROBE_DIR, stdio: 'inherit' });
    if (install.status !== 0) {
      console.error('probe npm install failed');
      process.exit(1);
    }
    const dev = spawnSync('npm', ['install', '-D', '@astrojs/node', '@astrojs/check', 'typescript', 'vitest'], {
      cwd: PROBE_DIR,
      stdio: 'inherit',
    });
    if (dev.status !== 0) {
      console.error('probe test devDependencies install failed');
      process.exit(1);
    }
  }
  writeFileSync(path.join(PROBE_DIR, 'astro.config.mjs'), ASTRO_CONFIG_SRC);
  writeFileSync(path.join(PROBE_DIR, 'vitest.config.ts'), VITEST_CONFIG_SRC);
  patchTsconfig();
}

// Idempotent defensive patch: the scaffold's own tsconfig.json already
// includes `"**/*"` (which covers src/lessons and src/pages/__lessons
// already), so this is normally a no-op — kept so a future `create-astro`
// template change that narrows the default `include` doesn't silently stop
// type-checking the lessons tree.
function patchTsconfig() {
  const p = path.join(PROBE_DIR, 'tsconfig.json');
  const tsconfig = JSON.parse(readFileSync(p, 'utf8'));
  tsconfig.include ??= [];
  let changed = false;
  for (const entry of ['.astro/types.d.ts', '**/*']) {
    if (!tsconfig.include.includes(entry)) {
      tsconfig.include.push(entry);
      changed = true;
    }
  }
  if (changed) writeFileSync(p, `${JSON.stringify(tsconfig, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// Lesson discovery
// ---------------------------------------------------------------------------

function discoverLessons() {
  const rels = globSync('**/*.mdx', { cwd: DOCS_EN }).sort();
  return rels.map((rel) => {
    const posixRel = rel.replaceAll('\\', '/');
    return {
      absPath: path.join(DOCS_EN, rel),
      mdxRelPath: `src/content/docs/en/${posixRel}`,
      module: posixRel.split('/')[0],
      lesson: path.basename(posixRel, '.mdx'),
    };
  });
}

// ---------------------------------------------------------------------------
// Shared: collect fences from descriptors + write the probe's lesson trees
// ---------------------------------------------------------------------------

function buildLessonsTree(descriptors) {
  rmSync(LESSONS_DIR, { recursive: true, force: true });
  rmSync(PAGE_LESSONS_DIR, { recursive: true, force: true });
  mkdirSync(LESSONS_DIR, { recursive: true });

  const fenceMap = new Map(); // namespace -> { mdxRelPath, module, lesson, fences: Map(destRelPath -> fenceNum) }
  const stats = new Map(); // module -> { collected, skippedNoPath, expectError, tests }
  const owners = new Map(); // src-rooted path (with ext) -> [namespace, ...] in module/file order
  const nsKeys = new Map(); // namespace -> Set(src-rooted path) it defines itself
  const pending = []; // [namespace, fence]

  for (const d of descriptors) {
    const counters = stats.get(d.module) ?? { collected: 0, skippedNoPath: 0, expectError: 0, tests: 0 };
    stats.set(d.module, counters);

    const namespace = `${d.module}__${d.lesson}`;
    const nsFences = new Map();
    const keys = new Set();
    const src = readFileSync(d.absPath, 'utf8');

    for (const f of collectFences(src)) {
      if (f.category === 'collected') {
        counters.collected++;
        if (f.path.endsWith('.test.ts')) counters.tests++;
        nsFences.set(destRelPath(namespace, f.path), f.fenceNum);
        keys.add(f.path);
        const list = owners.get(f.path) ?? [];
        if (!list.includes(namespace)) list.push(namespace);
        owners.set(f.path, list);
        pending.push([namespace, f]);
      } else if (f.category === 'skipped-no-path') {
        counters.skippedNoPath++;
      } else if (f.category === 'expect-error') {
        counters.expectError++;
      }
    }
    fenceMap.set(namespace, { mdxRelPath: d.mdxRelPath, module: d.module, lesson: d.lesson, fences: nsFences });
    nsKeys.set(namespace, keys);
  }

  for (const [namespace, f] of pending) {
    const destAbs = path.join(PROBE_DIR, destRelPath(namespace, f.path));
    mkdirSync(path.dirname(destAbs), { recursive: true });
    writeFileSync(destAbs, rewriteSpecifiers(f.body, f.path, namespace, owners, nsKeys.get(namespace)));
  }

  return { fenceMap, stats };
}

function printStats(stats) {
  console.log('\nPer-module fence summary (collected / skipped-no-path / expect-error / tests):');
  const totals = { collected: 0, skippedNoPath: 0, expectError: 0, tests: 0 };
  for (const [module, c] of [...stats.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${module}: ${c.collected} / ${c.skippedNoPath} / ${c.expectError} / ${c.tests}`);
    totals.collected += c.collected;
    totals.skippedNoPath += c.skippedNoPath;
    totals.expectError += c.expectError;
    totals.tests += c.tests;
  }
  console.log(`  TOTAL: ${totals.collected} / ${totals.skippedNoPath} / ${totals.expectError} / ${totals.tests}`);
}

// ---------------------------------------------------------------------------
// Check mode (default): `astro sync` once, then `astro check` once
// ---------------------------------------------------------------------------

const ANSI_RE = /\x1b\[[0-9;]*m/g;
// After ANSI stripping: `<repo-relative path>:<line>:<col> - error ts(1234): message`
const DIAG_RE = /^(.+?):(\d+):(\d+) - (error|warning|hint)(?: ts\((\d+)\))?: (.+)$/gm;

function mapDiagnosticFile(fenceMap, repoRelPath) {
  const norm = repoRelPath.replaceAll('\\', '/');
  const probeRel = norm.startsWith('tools/probe/') ? norm.slice('tools/probe/'.length) : null;
  if (!probeRel) return null;
  const lm = /^src\/lessons\/([^/]+)\/(.+)$/.exec(probeRel) ?? /^src\/pages\/__lessons\/([^/]+)\/(.+)$/.exec(probeRel);
  if (!lm) return null;
  const info = fenceMap.get(lm[1]);
  if (!info) return null;
  return { mdxRelPath: info.mdxRelPath, relPath: probeRel, fenceNum: info.fences.get(probeRel) };
}

function runAstroCheck(descriptors, { strict = false } = {}) {
  const { fenceMap, stats } = buildLessonsTree(descriptors);

  const sync = spawnSync(ASTRO_BIN, ['sync', '--root', PROBE_DIR], { cwd: REPO_ROOT, encoding: 'utf8' });
  if (sync.status !== 0) {
    console.error('astro sync failed:', sync.stdout, sync.stderr);
    process.exit(1);
  }

  const res = spawnSync(ASTRO_BIN, ['check', '--root', PROBE_DIR, '--minimumSeverity', 'warning'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  if (res.error) {
    console.error('failed to run astro check in the probe:', res.error.message);
    process.exit(1);
  }

  const clean = (res.stdout ?? '').replace(ANSI_RE, '');
  const diagnostics = [];
  let dm;
  while ((dm = DIAG_RE.exec(clean))) {
    const [, file, line, col, severity, code, message] = dm;
    diagnostics.push({ file, line, col, severity, code, message, mapped: mapDiagnosticFile(fenceMap, file) });
  }

  const errors = diagnostics.filter((d) => d.severity === 'error');
  const warnings = diagnostics.filter((d) => d.severity === 'warning' || d.severity === 'hint');

  if (diagnostics.length) {
    console.log(`\n${errors.length} error(s), ${warnings.length} warning(s):\n`);
    for (const d of diagnostics) {
      const where = d.mapped
        ? `${d.mapped.mdxRelPath}:fence #${d.mapped.fenceNum} (${d.mapped.relPath})`
        : `[unmapped] ${d.file}`;
      console.log(`${d.severity} ${where} — probe:${d.file}:${d.line}:${d.col}${d.code ? ` ts(${d.code})` : ''}: ${d.message}`);
    }
  } else if (res.status !== 0) {
    console.log('\nastro check exited non-zero but no parseable diagnostics were found; raw output:\n');
    console.log(clean, res.stderr ?? '');
  } else {
    console.log('\nno errors, no warnings.');
  }

  printStats(stats);

  const fail = errors.length > 0 || (strict && warnings.length > 0);
  return { errorCount: errors.length, warningCount: warnings.length, diagnostics, stats, fail };
}

// ---------------------------------------------------------------------------
// --build <module>/<lesson>: real `astro build` for one lesson at its real
// probe position (including its own special singleton files, if any).
// ---------------------------------------------------------------------------

function buildMode(target) {
  if (!target) {
    console.error('usage: node tools/verify-snippets.mjs --build <module>/<lesson>');
    process.exit(1);
  }
  const parts = target.split('/');
  const lesson = parts.pop();
  const module = parts.join('/');
  const mdxAbs = path.join(DOCS_EN, module, `${lesson}.mdx`);
  if (!existsSync(mdxAbs)) {
    console.error(`lesson not found: ${mdxAbs}`);
    process.exit(1);
  }

  const fences = collectFences(readFileSync(mdxAbs, 'utf8')).filter((f) => f.category === 'collected');
  if (!fences.length) {
    console.log(`${target}: no path-comment fences to build`);
    process.exit(0);
  }

  // Real position, no namespace rewrite: `@/`/relative specifiers already
  // mean what the lesson intends once every one of its own fences sits at
  // its real path together (a lesson's `astro.config.mjs`, if it collects
  // one, REPLACES this harness's generated adapter config for the duration
  // of this one build — restored below either way).
  // Two fences in the same lesson occasionally share one destination path on
  // purpose (e.g. dynamic-routes.mdx shows both a static and an "on-demand"
  // `src/pages/blog/[slug].astro` — last one in document order wins the
  // actual build). The backup must still capture the file's state from
  // BEFORE this run touched it at all, so only the FIRST fence to touch a
  // given path may record a backup for it — otherwise a later fence's
  // "backup" would just be an earlier fence's write from this same pass,
  // and restore would leak that content back onto disk instead of removing
  // a file that never really existed.
  const backups = new Map(); // relPath -> original content Buffer, or null if the file didn't exist
  for (const f of fences) {
    const dest = path.join(PROBE_DIR, f.path);
    if (!backups.has(f.path)) backups.set(f.path, existsSync(dest) ? readFileSync(dest) : null);
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, f.body);
  }

  console.log(`building probe with ${fences.length} fence(s) from ${target}: ${fences.map((f) => f.path).join(', ')}`);
  const res = spawnSync(ASTRO_BIN, ['build', '--root', PROBE_DIR], { cwd: REPO_ROOT, encoding: 'utf8' });
  const output = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim();
  console.log(output.split('\n').slice(-40).join('\n'));

  for (const [relPath, original] of backups) {
    const dest = path.join(PROBE_DIR, relPath);
    if (original === null) rmSync(dest, { force: true });
    else writeFileSync(dest, original);
  }
  rmSync(path.join(PROBE_DIR, 'dist'), { recursive: true, force: true });

  process.exit(res.status ?? 1);
}

// ---------------------------------------------------------------------------
// --test [module/lesson]: vitest over collected *.test.ts fences
// ---------------------------------------------------------------------------

function runVitest(descriptors, target) {
  const { fenceMap } = buildLessonsTree(descriptors);

  let filterArg = null;
  if (target) {
    const parts = target.split('/');
    const lesson = parts.pop();
    const module = parts.join('/');
    const namespace = `${module}__${lesson}`;
    if (!fenceMap.has(namespace)) {
      console.error(`no such lesson: ${target}`);
      process.exit(1);
    }
    filterArg = namespace;
  }

  const outFile = path.join(os.tmpdir(), `verify-snippets-vitest-${process.pid}-${Date.now()}.json`);
  const args = ['run', '--passWithNoTests', '--reporter=json', `--outputFile=${outFile}`];
  if (filterArg) args.push(filterArg);
  const res = spawnSync(VITEST_BIN, args, { cwd: PROBE_DIR, encoding: 'utf8' });

  let report = null;
  if (existsSync(outFile)) {
    try {
      report = JSON.parse(readFileSync(outFile, 'utf8'));
    } catch {
      // leave report null; caller falls back to raw output
    }
    rmSync(outFile, { force: true });
  }

  return { fenceMap, report, status: res.status, stdout: res.stdout, stderr: res.stderr };
}

function testMode(target) {
  const { fenceMap, report, status, stdout, stderr } = runVitest(discoverLessons(), target);

  if (!report) {
    console.log((stdout ?? '') + (stderr ?? ''));
    process.exit(status ?? 1);
  }

  const byLesson = new Map(); // "module/lesson" -> testResults[]
  for (const tr of report.testResults ?? []) {
    const norm = (tr.name ?? '').replaceAll('\\', '/');
    const m = /(?:src\/lessons|src\/pages\/__lessons)\/([^/]+)\//.exec(norm);
    const info = m && fenceMap.get(m[1]);
    const label = info ? `${info.module}/${info.lesson}` : m ? m[1] : '[unmapped]';
    const list = byLesson.get(label) ?? [];
    list.push(tr);
    byLesson.set(label, list);
  }

  for (const [label, results] of [...byLesson.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const assertions = results.flatMap((r) => r.assertionResults ?? []);
    const passed = assertions.filter((a) => a.status === 'passed').length;
    console.log(`${label}: ${passed}/${assertions.length} passed`);
    for (const a of assertions.filter((a) => a.status === 'failed')) {
      const firstLine = (a.failureMessages?.[0] ?? '').split('\n')[0];
      console.log(`  FAIL ${(a.fullName ?? a.title).trim()}: ${firstLine}`);
    }
  }

  console.log(
    `\n${report.numPassedTests ?? 0}/${report.numTotalTests ?? 0} test(s) passed across ${report.testResults?.length ?? 0} file(s).`,
  );
  process.exit(status ?? (report.success ? 0 : 1));
}

// ---------------------------------------------------------------------------
// --self-test
// ---------------------------------------------------------------------------

function selfTest() {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'verify-snippets-selftest-'));
  const mdxPath = path.join(tmpDir, 'self.mdx');

  // Exercises BOTH accepted `.astro` path-comment conventions: `Bad` uses the
  // literal `<!-- path -->` first line (primary, spec-documented form);
  // `Good` uses the `---` / `// path` frontmatter form (the one the real
  // corpus already uses ~11 times today, see file-header note).
  writeFileSync(
    mdxPath,
    [
      '---',
      'title: selftest',
      '---',
      '',
      '```astro',
      '<!-- src/components/Bad.astro -->',
      '---',
      'const count: number = "oops"; // real type error',
      '---',
      '<p>{count}</p>',
      '```',
      '',
      '```astro',
      '---',
      '// src/components/Good.astro',
      'const count: number = 1;',
      '---',
      '<p>{count}</p>',
      '```',
      '',
      '```ts',
      '// src/components/Good.test.ts',
      "import { experimental_AstroContainer as AstroContainer } from 'astro/container';",
      "import { describe, it, expect } from 'vitest';",
      "import Good from './Good.astro';",
      "describe('Good', () => {",
      "  it('renders', async () => {",
      '    const container = await AstroContainer.create();',
      '    const html = await container.renderToString(Good);',
      "    expect(html).toContain('>1<');",
      '  });',
      '});',
      '```',
      '',
      '```ts',
      '// src/components/Failing.test.ts',
      "import { describe, it, expect } from 'vitest';",
      "describe('failing', () => {",
      "  it('fails on purpose', () => { expect(1).toBe(2); });",
      '});',
      '```',
      '',
    ].join('\n'),
  );

  const descriptors = [{ absPath: mdxPath, mdxRelPath: 'selftest/self.mdx', module: '__selftest__', lesson: 'self' }];
  const ns = `${descriptors[0].module}__${descriptors[0].lesson}`; // "__selftest____self"

  const { diagnostics } = runAstroCheck(descriptors);
  const badTypeFailed = diagnostics.some(
    (d) => d.severity === 'error' && d.mapped?.relPath === `src/lessons/${ns}/components/Bad.astro`,
  );
  const goodTypePassed = !diagnostics.some(
    (d) => d.severity === 'error' && d.mapped?.relPath === `src/lessons/${ns}/components/Good.astro`,
  );

  const { report } = runVitest(descriptors, '__selftest__/self');
  const byFile = new Map();
  for (const tr of report?.testResults ?? []) {
    byFile.set((tr.name ?? '').replaceAll('\\', '/'), tr.assertionResults ?? []);
  }
  const goodAssertions = [...byFile.entries()].find(([f]) => f.endsWith('components/Good.test.ts'))?.[1] ?? [];
  const failingAssertions = [...byFile.entries()].find(([f]) => f.endsWith('components/Failing.test.ts'))?.[1] ?? [];
  const goodTestPassed = goodAssertions.length > 0 && goodAssertions.every((a) => a.status === 'passed');
  const failingTestFailed = failingAssertions.length > 0 && failingAssertions.some((a) => a.status === 'failed');

  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(LESSONS_DIR, { recursive: true, force: true });
  rmSync(PAGE_LESSONS_DIR, { recursive: true, force: true });

  const ok = badTypeFailed && goodTypePassed && goodTestPassed && failingTestFailed;
  const detail = { badTypeFailed, goodTypePassed, goodTestPassed, failingTestFailed };
  if (ok) {
    console.log(
      '\nself-test: PASS (bad-type fence [<!-- path --> form] failed astro check, good component ' +
        '[--- / // path form] + its container-API test passed, failing test fence failed vitest)',
      detail,
    );
    process.exit(0);
  }
  console.error('\nself-test: FAIL', detail);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  ensureProbe(args.includes('--refresh'));

  if (args.includes('--self-test')) return selfTest();

  const buildIdx = args.indexOf('--build');
  if (buildIdx !== -1) return buildMode(args[buildIdx + 1]);

  const testIdx = args.indexOf('--test');
  if (testIdx !== -1) return testMode(args[testIdx + 1]);

  const { fail } = runAstroCheck(discoverLessons(), { strict: args.includes('--strict') });
  process.exit(fail ? 1 : 0);
}

main();
