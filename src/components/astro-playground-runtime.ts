// Pure logic for <AstroPlayground>. No DOM access at module scope except
// loadAstroCompiler(), which only touches `import()` — no `document`/`window`
// — so this file stays importable and unit-testable under plain Node.
// Mirrors svelte-deep-dive's svelte-playground-runtime.ts (same shape: a
// lazy CDN-loaded compiler, a pure compile() wrapper, a copyFor() i18n table).
//
// IMPORTANT version note (found empirically, not assumed — see this repo's
// verified fact "Astro 7 = Rust compiler only"): the compiler this repo's
// `astro build`/`astro check` actually run is `@astrojs/compiler-rs`, a
// native Rust NAPI addon. Its only browser/WASM form
// (`@astrojs/compiler-binding-wasm32-wasi`) requires a growable *shared*
// WebAssembly.Memory plus a napi async-work-pool Worker — proven to fail to
// even link when loaded from a CDN (esm.sh): `LinkError:
// WebAssembly.Instance(): Import #6 "env" "napi_create_async_work": function
// import requires a callable`. There is no version of the real Astro 7
// compiler this playground could load in a browser.
//
// So this playground instead loads the classic, purpose-built-for-browsers
// `@astrojs/compiler` package (the pre-7.0 Go compiler, compiled to a plain
// WASM module with the well-known `initialize({ wasmURL })` + `transform()`
// API) — the same package the official Astro REPL has always used for
// in-browser compiles. Proven live in a real browser:
//   - `transform(source, { scopedStyleStrategy: 'attribute' })` on a scoped
//     `<style>` produces `.card[data-astro-cid-XXXXXXXX]` — byte-identical
//     in SHAPE to this course's real built output (styles-and-scripts.mdx),
//     confirming `scopedStyleStrategy: 'attribute'` (not the package's own
//     default, `'where'`) is required to match Astro 7's real default.
//   - the classic compiler is far more lenient about malformed HTML than the
//     Rust compiler this course documents elsewhere (astro-syntax-deep.mdx's
//     "proven wrong four ways" `astro check` errors) — an unclosed `<p>` or
//     mis-nested `<span></div>` compiles with ZERO diagnostics here, so this
//     playground cannot reproduce those specific errors. What DOES reliably
//     produce a real diagnostic is `set:html` on an element that still has
//     child nodes (`WARNING_SET_WITH_CHILDREN`, code 2006) — a genuine,
//     version-independent Astro mistake, used as this playground's default
//     diagnostic-producing sample instead.
// Both facts are called out again, briefly, right next to each embedding so
// a reader never mistakes this playground's compiler for the one that
// actually gates this course's own build.

export type AstroCompiler = typeof import('@astrojs/compiler');

export const ASTRO_CDN_VERSION = '4.0.0';
const ESM_BASE = `https://esm.sh/@astrojs/compiler@${ASTRO_CDN_VERSION}`;
const WASM_URL = `${ESM_BASE}/astro.wasm`;

export const VERSION_BADGE = {
  en: () => `@astrojs/compiler ${ASTRO_CDN_VERSION} (esm.sh, classic browser compiler — not this course's Rust compiler)`,
  th: () => `@astrojs/compiler ${ASTRO_CDN_VERSION} (esm.sh, ตัวคอมไพล์รุ่นเก่าสำหรับเบราว์เซอร์ — ไม่ใช่ตัว Rust compiler ของคอร์สนี้)`,
};

// ---------------------------------------------------------------------------
// Lazy-load + initialize @astrojs/compiler (ESM + one-time WASM init).
// ---------------------------------------------------------------------------

let compilerPromise: Promise<AstroCompiler> | null = null;

export function loadAstroCompiler(): Promise<AstroCompiler> {
  if (!compilerPromise) {
    compilerPromise = (async () => {
      const mod = (await import(/* @vite-ignore */ ESM_BASE)) as AstroCompiler;
      await mod.initialize({ wasmURL: WASM_URL });
      return mod;
    })();
  }
  return compilerPromise;
}

// ---------------------------------------------------------------------------
// Compile
// ---------------------------------------------------------------------------

export interface DiagnosticLine {
  text: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  location?: string;
  hint?: string;
}

export type CompileOutcome =
  | { ok: true; js: string; diagnostics: DiagnosticLine[] }
  | { ok: false; error: string };

interface RawDiagnostic {
  severity: number; // 1 error, 2 warning, 3 info, 4 hint
  code: number;
  location: { file: string; line: number; column: number; length: number };
  hint?: string;
  text: string;
}

const SEVERITY_NAMES: Record<number, DiagnosticLine['severity']> = {
  1: 'error',
  2: 'warning',
  3: 'info',
  4: 'hint',
};

function formatDiagnostic(d: RawDiagnostic): DiagnosticLine {
  return {
    text: d.text,
    severity: SEVERITY_NAMES[d.severity] ?? 'info',
    location: d.location ? `${d.location.line}:${d.location.column}` : undefined,
    hint: d.hint,
  };
}

// Fixed strategy matching this course's real, documented default (proven —
// see module doc comment above). Not exposed as a toggle: unlike Svelte's
// client/server `generate` target, Astro's transform output shape doesn't
// have a reader-meaningful toggle worth adding UI for here.
const TRANSFORM_OPTIONS = { sourcemap: false as const, scopedStyleStrategy: 'attribute' as const };

export async function compileAstro(compiler: AstroCompiler, source: string): Promise<CompileOutcome> {
  try {
    // transform() is async in this (classic, pre-7.0) compiler package —
    // proven live: it returns a Promise, not a plain result object.
    const result = (await compiler.transform(source, TRANSFORM_OPTIONS)) as unknown as {
      code: string;
      diagnostics: RawDiagnostic[];
    };
    return { ok: true, js: result.code, diagnostics: result.diagnostics.map(formatDiagnostic) };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? String(e) };
  }
}

// ---------------------------------------------------------------------------
// i18n copy (mirrors svelte-playground-runtime.ts's copyFor)
// ---------------------------------------------------------------------------

export const COPY = {
  en: {
    compile: 'Compile',
    loading: 'Loading Astro compiler…',
    copy: 'Copy',
    copied: 'Copied!',
    output: 'Compiled JS',
    diagnostics: 'Diagnostics',
    noDiagnostics: 'No diagnostics ✓',
    loadFailed: 'Could not load the browser compiler (network blocked, or esm.sh unreachable). Try again, or read the proven `astro check` output above instead.',
  },
  th: {
    compile: 'คอมไพล์',
    loading: 'กำลังโหลด Astro compiler…',
    copy: 'คัดลอก',
    copied: 'คัดลอกแล้ว!',
    output: 'JS ที่คอมไพล์แล้ว',
    diagnostics: 'Diagnostics',
    noDiagnostics: 'ไม่มี diagnostic ✓',
    loadFailed: 'โหลดตัวคอมไพล์ในเบราว์เซอร์ไม่สำเร็จ (เครือข่ายถูกบล็อก หรือเข้าถึง esm.sh ไม่ได้) ลองใหม่อีกครั้ง หรืออ่านผลลัพธ์ `astro check` จริงด้านบนแทน',
  },
};

export function copyFor(lang: string | undefined): typeof COPY.en {
  return lang?.startsWith('th') ? COPY.th : COPY.en;
}
