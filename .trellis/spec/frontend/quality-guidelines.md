# Quality Guidelines

> Executable frontend test-runner and CI contracts.

## Scenario: Keep Vitest and Playwright discovery disjoint

### 1. Scope / Trigger

- Apply this contract whenever adding or renaming a frontend test, changing a
  runner config, changing an npm test script, or editing the Pages CI test
  steps.
- Vitest and Playwright both recognize `*.spec.ts` by default. A runner must
  own its files through an explicit positive boundary rather than assuming the
  other runner's config will exclude them.

### 2. Signatures

- `npm test` runs every Vitest test under `src/` and no Playwright test.
- `npm run test:unit` runs `src/**/*.test.ts`.
- `npm run test:component` runs `src/**/*.test.tsx`.
- `npm run test:e2e` uses `playwright.config.ts`; live and production suites
  require their named Playwright configs.
- `.github/workflows/pages.yml` must run the aggregate `npm test` gate as well
  as the split unit/component gates.

### 3. Contracts

- `vitest.config.ts` owns the positive discovery list:
  `src/**/*.test.ts` and `src/**/*.test.tsx`.
- Playwright owns `e2e/`. Its `testDir`, `testMatch`, and `testIgnore` settings
  do not constrain Vitest.
- New Vitest tests belong under `src/` and use `.test.ts` or `.test.tsx`.
  New browser tests belong under `e2e/` and use the matching Playwright config.
- The aggregate command is a boundary regression gate, not a replacement for
  the split scripts that make unit/component failures visible in CI.

### 4. Validation & Error Matrix

| Condition | Required result |
|---|---|
| `npm test` collects `e2e/*.spec.ts` | Release blocker; restore the positive Vitest `include` boundary. |
| Vitest reports `Playwright Test did not expect test() to be called here` | Treat as cross-runner discovery, not as a failing browser assertion. |
| `npm test` passes but a split script fails | Release blocker; fix the failing test or its intended classification. |
| A Playwright `--list` command shows a test from `src/` | Release blocker; correct the Playwright discovery boundary. |
| CI omits `npm test` | The runner-boundary regression is unguarded; restore the aggregate step. |

### 5. Good / Base / Bad Cases

- Good: `npm test` collects only `src/**/*.test.ts(x)`, while the default,
  live, and production Playwright configs collect only their intended `e2e/`
  files.
- Base: adding another `.test.ts` under `src/` requires no config change and
  appears in both the aggregate and the appropriate split command.
- Bad: leaving Vitest on its default `**/*.{test,spec}.*` glob lets it import
  Playwright suites and fail before any browser test runs.

### 6. Tests Required

- Run `npm test`, `npm run test:unit`, and `npm run test:component`; all must
  exit zero and their aggregate file/test totals must equal the two split
  suites combined.
- Run `npm run test:e2e` and the configured production smoke before release.
- When changing discovery config, run Playwright `--list` for each named config
  and assert that no `src/` test appears.
- Keep `npm test` in Pages CI so a future default-glob regression fails before
  deployment.

### 7. Wrong vs Correct

#### Wrong

```ts
export default defineConfig({
  test: { environment: "jsdom" },
});
```

Vitest's default glob also matches `e2e/*.spec.ts`.

#### Correct

```ts
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "jsdom",
  },
});
```
