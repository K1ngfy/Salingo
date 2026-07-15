# Repository Guidelines

## Project Structure & Module Organization

This is a static-exported Next.js 15 and React 19 application for CISSP study. Route pages and layouts live in `src/app/` (for example, `src/app/exam/page.tsx`); shared interactive UI belongs in `src/components/`. Put domain models, validation, AI-client, FSRS, and utility code in `src/lib/`. The source question-bank definitions are in `src/data/`; the generated runtime dataset is `public/data/questions.json`. Scripts that generate or validate that dataset live in `scripts/`. Build output (`out/`), Next cache (`.next/`), and browser-check artifacts (`output/`) are generated and should not be hand-edited.

## Build, Test, and Development Commands

Use Node.js 20+ (Node 22 recommended) and npm 10+.

```bash
npm install                 # install dependencies
npm run dev                 # start local development at http://localhost:3000
npm run lint                # run Next.js ESLint rules
npm run typecheck           # run strict TypeScript checks without emitting files
npm run generate:bank       # regenerate public/data/questions.json
npm run check:bank          # validate question structure, IDs, coverage, and answers
npm run build               # create the static export in out/
npm run check               # lint, typecheck, validate bank, and build
```

Run `npm run check` before submitting changes. Regenerate and validate the JSON whenever `src/data/` or question-generation logic changes.

## Coding Style & Naming Conventions

Write strict TypeScript; use the `@/*` alias for imports from `src/`. Follow the existing two-space indentation, semicolons, double quotes, and named exports where practical. Components use PascalCase filenames and exports (for example, `PracticeSession`); hooks and helpers use camelCase. Keep route files named by Next.js conventions (`page.tsx`, `layout.tsx`). Prefer Tailwind utilities and the existing `src/components/ui/` primitives over one-off global CSS. ESLint uses `next/core-web-vitals` and `next/typescript`; resolve warnings rather than suppressing them.

## Testing & Data Integrity

There is no separate unit-test suite. Treat `npm run check` as the required automated gate. For UI changes, manually exercise the affected desktop and mobile route, keyboard focus, and persisted LocalStorage behavior. Preserve the question schema and unique IDs; generated questions must remain original and use the current outline marker.

## Commit & Pull Request Guidelines

This workspace does not include Git history, so no established commit format can be verified. Use concise imperative subjects such as `Add review filter` or `Fix exam timer pause`. Keep commits focused. Pull requests should describe user-visible behavior and data-impacting changes, link the relevant issue when available, list checks run, and include screenshots for visual or responsive changes. Never commit `.env` or API keys; use `.env.example` for configuration documentation.
