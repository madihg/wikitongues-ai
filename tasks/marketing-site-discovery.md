# Marketing site discovery (2026-08-28)

Discovery for porting/extending the How-it-works story onto the public marketing site.
All paths absolute. Site checkout: `/Users/halim/Documents/wikitongues-ai-web`.

## 1. The marketing site: repo, deploy, stack

- **Vercel project**: `wikitongues-ai-site` (prj_4hf6CqcNMPoRUXXaEopOqkpAufDa, team team_9h3UVrcMfPTPWYdvGpnKezrd). Domains: `wikitongues-ai-site.vercel.app` (+ `-halims-projects` and `-git-main` aliases).
- **Git repo**: `github.com/madihg/wikitongues-web-ai`, default branch `main`, **root directory = repo root** (Next.js app at top level: `app/`, `components/`, `content/`, `lib/`).
- **Local checkout**: `/Users/halim/Documents/wikitongues-ai-web` - clean, on `main`, up to date with `origin/main` (HEAD 5830c16).
- **Deploy flow**: Git-connected - **push to `main` auto-deploys to production**. Latest production deploy was built from commit 5830c16 on `main`. Committing+pushing on this repo's default flow is explicitly allowed once builds pass.
- **Stack**: Next.js 15 App Router, React 19, Tailwind 3.4, TypeScript, **fully static export** (`output: "export"`, `trailingSlash: true`, `images.unoptimized`) - NO server runtime, NO API routes possible on the site. `vercel.json` sets `framework: "nextjs"` + security headers.
- **Gates** (`package.json`): `npm run verify` = `tsc --noEmit` + `vitest run` (content tests) + `next build` + `node tests/smoke.mjs` (content checks against `out/index.html`). This is the site's build gate before push.

### Name disambiguation (from the site's Context.md - a real past mix-up)

| URL                            | Serves                                                | Vercel project      |
| ------------------------------ | ----------------------------------------------------- | ------------------- |
| wikitongues-ai-site.vercel.app | marketing site                                        | wikitongues-ai-site |
| wikitongues-ai-web.vercel.app  | annotator platform (never touch)                      | wikitongues-ai      |
| web-three-rho-89.vercel.app    | platform stable alias; site's stats API reads from it | wikitongues-ai      |

Repo name (`wikitongues-web-ai`) is a letter-swap from the old Vercel project name. The 404-test: marketing site 404s `/login`; the platform serves it.

## 2. Design language (concrete file references)

- **Tokens**: `/Users/halim/Documents/wikitongues-ai-web/app/globals.css` - CSS custom properties on `:root`, light-only palette:
  - background `#fafaf8`, surface `#ffffff`, surface-sunken `#f2f2ef`, text `#1a1a1a`, muted `#595959`, borders `#e2e2de`/`#c7c7c1`, footer `#222222`.
  - one accent: **deep teal `#0C6B6B`** (hover `#0a5f5f`, pressed `#084f4f`, subtle `#e6f0f0`), AA-verified 6.30:1 on white.
  - sequential data-viz scale `--viz-1..5` derived from the teal (`#0a4f4f` -> `#b9dbdb`).
  - `--header-h: 64px`, standard easing vars, `prefers-reduced-motion` kill-switch, `:focus-visible` teal outline.
- **Fonts**: `app/layout.tsx` - `next/font/google`: **Fraunces** (`--font-serif`, h1-h3 via `@layer base`) + **Inter** (`--font-sans`, body). Tailwind `font-serif`/`font-sans` map to these vars in `tailwind.config.ts`.
- **Tailwind mapping**: `tailwind.config.ts` - semantic color names (`ink`, `muted`, `line`, `accent.*`, `footer.*`), maxWidths `measure` (68ch), `container` (46rem), `container-wide` (65rem), `container-bleed` (80rem), letterSpacing `overline` (0.08em). An `.overline` component class (uppercase small caps label) in globals.css.
- **Layout system**: `app/layout.tsx` wraps every page in `SkipLink` + `Header` + `main#main` + `Footer`, injects Organization+FAQPage JSON-LD. Sections built with `components/primitives/Section.tsx`; hero/section pattern = `max-w-container-bleed px-5 sm:px-6` outer, `max-w-measure` prose inner, overline + serif h1.
- **Nav**: content-driven - `content/en/site.ts` `ui.nav` (hrefs root-relative like `/#project`, `/research/`); rendered by `components/layout/Header.tsx` (sticky, zero-JS mobile `<details>` menu). Footer repeats nav (site.ts line ~95).
- **Adding a page**: create `app/<slug>/page.tsx` (static, `Metadata` export, canonical `/<slug>/`), put copy as data in `content/en/<slug>.ts` (house rule: "content is data, never in JSX", typed in `content/types.ts`), add nav entries in `content/en/site.ts`, optionally gate behind a flag in `content/config.ts` + `lib/flags.ts` (`NEXT_PUBLIC_FLAG_<NAME>` env override). Precedent: `/research` (`app/research/page.tsx`, flag `researchRoute`, copy in `content/en/researchPage.ts`).
- **Diagrams precedent**: `components/research/diagrams/{EpisodeFlow,Flywheel,MethodLadder}.tsx` - hand-drawn SVG React components using the CSS vars.
- **Live numbers precedent**: `components/research/useStats.ts` - client hook, module-level cached single fetch of `statsApi.url` (`content/config.ts`) = `https://web-three-rho-89.vercel.app/api/public/stats`, overridable via `NEXT_PUBLIC_STATS_API_URL`. `credentials: "omit"`. Components: `HeadlineStat.tsx`, `StatsGrid.tsx`.

## 3. The app's How-it-works page today (`web/src/app/how-it-works/page.tsx`)

Researcher-gated (admin layout RoleGuard), `force-dynamic`, every number computed per request by `computeMethodMetrics(prisma)` from `web/src/lib/method-metrics.ts`. Sections:

a. **What this is** + 6-tile stat strip: goldAnswers, pairwiseComparisons, parallelPairs, lexEntries, annotators, frozenPrompts (+ computedAt timestamp).
a2. **"The whole system" SVG** - 4 layers (community / knowledge stores + deduced grammar / per-question serving with leak guard / judgment + frozen exam + Agreement Score) with live counts interpolated: annotators, goldAnswers, lexEntries, parallelPairs, poolComparisons.
b. **Journey v0-v3 SVG** - fixed copy, no live data.
c. **How one answer is built** - 6-step assembly list (METHOD, gold exemplars, parallel sentences, dictionary lines, question, terminal contract), leak-guard badges. Fixed copy.
d. **Exact prompts rendered verbatim** - imports `IGALA_SYSTEM_V2` + `igalaTerminalContract` from `web/src/lib/generation-prompt-v2.ts` and `IGALA_SYSTEM_V3` from `web/src/lib/generation-prompt-v3.ts`. House rule: imported, never copied.
e. **Benchmark** - `BenchmarkBars` component (`web/src/components/arena/benchmark-bars.tsx`) fed `candidates`, `ceilingChrf = m.agreementCeilingChrf`, `leakFreePrompts`; prose uses frozenPrompts, leakedPrompts, leakFreePrompts, pairwiseComparisons, bothInadequate %, poolComparisons, poolBothInadequate %; collapsible raw chrF table with both ceilings (asShipped vs onePerAnnotator).
f. **What is being tested now** - fixed copy + lexEntries (live).
g. **What changed, when** - hardcoded dated changelog (Aug 9/12/13/14/17, 2026) - fixed history by design, no live source.

## 4. Exact live-data surface the site would need (the Build-phase API contract)

From `MethodMetrics` (`web/src/lib/method-metrics.ts`):

- **corpus** (`CorpusCounts`): goldAnswers, pairwiseComparisons, pairwiseBothInadequate, poolComparisons, poolBothInadequate, parallelPairs, lexEntries, annotators (seed @test.com excluded).
- **benchmark** (`BenchmarkShape`): frozenPrompts, promptsWithGold, leakedPrompts, leakFreePrompts.
- **ceilings**: asShipped + onePerAnnotator, each a `CeilingResult` { chrfAll, chrfClean, nPromptsAll, nPromptsClean }.
- **agreementCeilingChrf**: the chrF anchoring Agreement Score 100 (= onePerAnnotator.chrfClean).
- **candidates** (`CandidateScore[]`, sorted best-first): name, approach ("untouched" | "retrieval v1..v4" | "fine-tuned" | "other"), n, nClean, strippedChrfAll, strippedChrfClean, agreementScore (uncapped), agreementCiLow/High, agreementUnderpowered.
- **computedAt**.
- **Changelog**: hardcoded in the page today - would ship as static content on the site (or be extracted to a shared data module), not an API.
- **Prompt texts** (if the site mirrors section d): IGALA_SYSTEM_V2/V3 + terminal contract - server-side strings in the app; the site cannot import them, so they'd need to ride the public endpoint or be accepted as a link to the app/GitHub.

### What exists publicly today vs. the gap

`GET /api/public/stats` (`web/src/app/api/public/stats/route.ts`, shaped by `web/src/lib/public-stats.ts`) is already live: CORS `*`, unauthenticated, revalidate 300s, aggregate-only. It exposes: prompts {total, heldOutBenchmark, byCategory}, gold {coldAuthoredAnswers, corrections, total}, judgments {pairwiseTotal, bothInadequate, bothInadequateRate, decidedWinner}, annotators {active}, modelOutputPurity milestone, languages, generatedAt. Site type mirror: `content/types.ts` `PublicStats`.

**Missing from the public endpoint** (needed for a public How-it-works): parallelPairs, lexEntries, pool preference stats (poolComparisons/poolBothInadequate), the whole scoreboard (candidates + agreement scores + CIs), both ceilings + agreementCeilingChrf, leak counts (leakedPrompts/leakFreePrompts). Build options: extend `/api/public/stats` (site's `PublicStats` type + tests must be updated in lockstep) or add e.g. `/api/public/method` returning a public-safe projection of `computeMethodMetrics` with the same CORS/revalidate/seed-exclusion conventions. Names/emails/raw Igala answers must never cross the boundary; candidate model names are already public on the site's sample leaderboard.

## 5. Constraints recap

- Site repo: commit+push to `main` allowed once `npm run verify` passes (auto-deploys).
- App repo (this worktree): NO git commits here; changes land via the orchestrator at the end. Gates: tsc/eslint/vitest. Do not edit `web/src/lib/personas.ts`.
- Old Vercel project `wikitongues-web-ai` still exists serving a stale build - ignore it; never touch the `wikitongues-ai` (platform) project.
