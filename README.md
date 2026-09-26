# Astro Deep Dive

Bilingual (EN/TH) Astro 7 + Starlight course.

## Harness

`tools/verify-snippets.mjs` proves lesson code snippets actually compile
(and, where a `*.test.ts` fence exists, actually run) against a real Astro 7
project — this course has no in-browser playground, so a real probe project
plus `astro check` / `astro build` / `vitest` is the only way to catch a
snippet that's subtly wrong.

```sh
npm run verify                       # astro check every collected fence
node tools/verify-snippets.mjs --refresh       # wipe + rescaffold tools/probe first
node tools/verify-snippets.mjs --strict        # also fail on warnings
node tools/verify-snippets.mjs --build <module>/<lesson>   # real `astro build` for one lesson
node tools/verify-snippets.mjs --test [module/lesson]      # vitest over *.test.ts fences
node tools/verify-snippets.mjs --self-test     # harness self-check
```

### Fence convention

A collectible fence's first line is a path comment naming the real file it
represents; the line is kept (inert) in the written file.

- `` ```astro `` — first line `<!-- src/components/Card.astro -->` (path
  must end `.astro`, must start `src/`). **Only safe for a component with NO
  frontmatter/script section** — see the correctness note below.
- `` ```astro `` — **or**, the first line is `---` (the component's own
  real frontmatter fence) and the SECOND line is `// src/components/Card.astro`.
  This is the form the real corpus already uses in ~11 places today. Prefer
  this form for any component that has a script section.
- `` ```ts ``/`` ```js ``/`` ```mjs `` — first line `// <path>`, path
  ending `.ts`/`.js`/`.mjs` and starting `src/`, or exactly
  `astro.config.mjs`. This also covers `*.test.ts` fences (run by `--test`)
  and the special singleton files (`src/content.config.ts`,
  `src/middleware.ts`, `src/actions/index.ts`, `src/live.config.ts`,
  `src/env.d.ts`).
- A trailing ` — comment` after the path itself is tolerated on either form
  (seen already in the corpus, e.g. `// astro.config.mjs — enabling
  on-demand rendering on Cloudflare`).
- A first line containing `@expect-error` is a deliberate-error demo and is
  skipped. Anything else (no path comment) is a skipped fragment. Fences
  inside a quiz `export const ... = [...]` array or a
  `<SpotTheBug code={`...`}>` prop are excluded before fence-scanning even
  starts (same technique as `tools/check-parity.mjs`).

**Correctness note, verified against the installed astro@7.3.5 compiler:**
the literal `<!-- path -->`-then-`---` form does NOT work for a component
that needs a script section — Astro only recognizes `---` as frontmatter
when it is the file's true first line, so with a comment above it the
script section is silently not parsed as frontmatter (a real type error at
its declaration instead surfaces as a confusing "cannot find name" error at
the point of use in the template). Use the `---` / `// path` form for any
component with logic; reserve the literal `<!-- path -->` form for
frontmatter-less fragments only.

### Probe collections (check mode)

Every run writes a fixed `tools/probe/src/content.config.ts` (`blog`,
`authors`) and `src/live.config.ts` (`products`) so `astro sync` emits real
types for the collections lessons reference by name — a lesson's own
config fences are namespaced away in check mode and can't provide them.
Add a field there when a new lesson reads `entry.data.<field>` on one of
these; `--build` swaps the lesson's own config in and restores these after.

### Where fences land

- `src/pages/**` fences land under the probe's REAL
  `src/pages/__lessons/<module>__<lesson>/<rest>` tree, so Astro's router
  discovers them as real (harmless, never-linked) routes and `astro sync`
  generates real per-route types.
- Everything else — including the special singleton files above — lands
  under the inert `src/lessons/<module>__<lesson>/<rest>` tree and
  type-checks as a plain module. `astro:content` / `astro:actions` /
  `astro:middleware` / `astro:env` all resolve regardless of a file's
  location: Astro ships static ambient fallback declarations for all four
  (`node_modules/astro/types/{content,actions,env}.d.ts`, `astro:middleware`
  directly in `client.d.ts`), unconditionally referenced from
  `.astro/types.d.ts` once `astro sync` has run — verified directly against
  the installed package, not assumed.
- `--build <module>/<lesson>` is the one mode where a lesson's OWN special
  files matter for real: every collected fence of that one lesson is
  written to its real path under `tools/probe/` (backed up first), a real
  `astro build` runs, the tail of its output is printed, and everything is
  restored afterward.
- `@/x` imports (not used in the corpus today, but resolved if a future
  lesson adds them) are documented to mean `src/x`. Relative and `@/`
  specifiers referencing another fence must carry the real extension
  (`.astro`, `.ts`, `.js`, `.mjs`) — resolved own-lesson-first, else the
  first lesson (module/file order) that defines that exact path.

### Known, accepted gaps

- Default (check) mode type-checks lesson files as plain modules; it does
  NOT register a lesson's own `content.config.ts` as the real project
  config, so `getCollection('blog')` etc. elsewhere in the SAME lesson
  type-checks against an empty `DataEntryMap` (reports `Property 'data'
  does not exist on type 'never'` rather than confirming the real schema
  shape). Full, schema-accurate validation of a lesson's own content
  collection is only available via `--build`, which puts the real
  `content.config.ts` at the real project root for one real `astro build`.
- A relative import to a file type this harness doesn't collect (e.g. a
  `.jsx` framework component — only `astro`/`ts`/`js`/`mjs` fences are
  collected, per spec) correctly surfaces as an unresolved module — a real,
  reportable gap in the lesson, not a harness bug.
- If a lesson defines two fences at the identical destination path (e.g. a
  static vs. "on-demand" variant of the same route, shown deliberately side
  by side), the later one in document order wins for both `astro check` and
  `--build`.
