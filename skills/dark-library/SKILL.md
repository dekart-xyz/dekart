---
name: dark-library
description: Use when creating or changing anything under src/client/dark/ or src/server/dark/, or when a new feature has self-contained logic/UI that can live there.
---

# Dark Library

Policy and scoped exceptions live in `AGENTS.md`. This skill describes how to
implement them. Start with new features; do not migrate existing modules or add
a template library. Bootstrap tooling only together with the first real library.

## Layout and naming

Name by capability (`geofilter`, `tilecache`), not feature/screen. Client names
are lowercase, one word or kebab-case; server names are one lowercase word,
matching the Go package name.

```text
src/client/dark/<name>/
  index.ts             public entry: re-exports + @packageDocumentation only
  *.ts, *.tsx          strict TypeScript implementation
  *.module.css         component styles
  store.ts             only react-redux integration (Redux libraries)
  *.test.ts(x)         public contract tests, imports from ./index only
  examples.test.ts(x)  executable examples included in generated docs
  README.md            generated, committed, reviewed

src/server/dark/<name>/
  doc.go               package purpose and invariants
  *.go                 implementation
  *_test.go            package <name>_test; public API only
  example_test.go      Example functions with // Output:
  README.md            generated, committed, reviewed
```

Client public declarations live in implementation files and are re-exported
through `index.ts`. The remaining client stays JS. Never edit generated docs
directly; change doc comments or examples and regenerate.

## Isolation and no-mock contract

Allowed imports:
- Files in the same library.
- Another dark library's public entry: `../<other>/index` on client,
  `dekart/src/server/dark/<other>` on server.
- Third-party packages in `node_modules`, Go module dependencies and Go stdlib,
  subject to the deny list and no-mock rule below.

Forbidden dependencies and behavior:
- App files under `src/client` or `src/server` outside `dark/`, generated proto
  packages (including `dekart-proto`), app reducers/actions, `api.js`, `grpc`,
  tracking or app state. Reviewed glue maps proto objects to/from library types.
- Go imports: `os`, `os/exec`, `net`, `net/*`, `database/sql`, `log`, `syscall`,
  `unsafe`, `io/ioutil`, `cloud.google.com/*`, `github.com/rs/zerolog`.
- Client I/O: `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`,
  `localStorage`, `sessionStorage`, `indexedDB`, `document.cookie`,
  `navigator.sendBeacon`, `console`.
- Direct clock/random/timer access: `Date.now`, argument-free `new Date()`,
  `Math.random`, `setTimeout`, `setInterval`, `time.Now`, `time.After`,
  `math/rand`, `crypto/rand`.
- Test mocks: `vi.mock`, `vi.spyOn`, `vi.stubGlobal`, fake timers, fetch/MSW
  mocks, `httptest`, sqlmock or fake clients. `vi.fn` must not replace a module
  or global; passing it as an explicit callback input is fine.
- Mutable package/module state: reassignment or mutation of package values,
  `sync.Once*` lazy initialization, Go `init()` side effects, client module-level
  `let`/`var`, or mutation of module-level containers (even declared `const`).
- react-redux access outside `store.ts`, including `useSelector`, `useStore`,
  `connect` and `ReactReduxContext`; action type literals without `<name>/`.

Package values initialized once at declaration and never reassigned or mutated
are allowed: sentinel errors, compiled regexps and read-only lookup tables.
The check script catches `init()` and module-level `let`/`var`; never-mutated
values are an agent rule.

Every export must be testable through its public API using real inputs only.
Callers inject I/O, time, randomness and timer behavior as arguments, callback
props or passed-in functions. Plain in-test functions/values supplied at that
boundary are inputs, not mocks. Rendering, DOM events and component-instance
state (`useState`, `useReducer`) are fine, as is library-owned Redux state.
The mutable-state ban applies to state shared at package/module scope, not
state owned by a component instance or an injected Redux store. A dependency
that requires mocking belongs in reviewed code.

Non-dark client code also imports libraries only through
`src/client/dark/<name>/index`, never deep implementation paths.

## Redux and React integration

A Redux-backed library exports `KEY` (documented default mount key), its `State`
and `Action` types, reducer, `<name>/`-prefixed action creators, slice-only
selectors, components and hooks. The app mounts the reducer at any key and
passes `getState: (root: unknown) => State` once through the library's Provider
or a prop, following the Kepler locator pattern.

Only `store.ts` touches react-redux. Its selector wrapper reads the injected
locator from context, then uses `useSelector(root => select(getState(root)))`.
Throw a clear error when the locator is missing. Never assume root-state keys
or read app slices such as `report`, `dataset` or `workspace`.

Reviewed JS glue mounts `[lib.KEY]: lib.reducer` (or another key), renders
`<lib.Provider getState={s => s[lib.KEY]}>`, maps app/proto data into props, and
passes I/O callbacks such as `onSave` or `fetchRows`. Reviewed actions/thunks
dispatch library actions when server data arrives. Another dark library's state
is accessed only through its exported hook/selector, never its internals.

## Tests, docs and review

- Contract tests import only `./index` on client (third-party test/render/store
  tooling and other libraries' public entries are allowed); Go tests declare
  `package <name>_test`. Assert public input/output behavior, never internal
  helpers, and do not copy implementation logic into tests.
- Use Vitest + jsdom + Testing Library for components/hooks. A test Redux store
  contains only dark reducers. Use `go test` for server libraries. Cypress
  covers the reviewed glue integration under the existing repo rules.
- Every exported symbol has a doc comment stating purpose, inputs, outputs,
  invariants and error behavior. Provide an executable example per exported
  function and per documented edge case.
- Every string-emitting export (SQL, HTML, URL) documents its escaping contract
  and has at least one hostile-input example (quote, backslash, script tag as
  relevant) in `README.md`.
- TypeScript examples use named regions in `examples.test.ts(x)`, included in
  doc comments with `{@includeCode ./examples.test.ts#region}` (use the actual
  filename). Vitest executes them. Go `Example*` functions use `// Output:`;
  `go test` verifies output and gomarkdoc renders them.
- Generate and commit `README.md` per library from TSDoc/Go docs and examples.
  TypeDoc uses `disableSources: true`; gomarkdoc has source links off. Output
  contains no source line numbers or git revisions. CI regenerates docs and
  fails on any diff with `git diff --exit-code`.
- Behavior changes without signature changes still require a doc comment or
  example change (agent rule). No semver: callers change in the same PR. List
  any README/interface changes and explicitly call out breaks under
  `Dark API changes` in the PR description.
- Review order: generated README diffs, contract tests/examples and coverage,
  reviewed glue, then everything else outside `dark/`. Skip dark implementation
  review. CI checks plus Vladi's API/test review are the trust signal; there is
  no coverage threshold or doc-completeness gate. Split a library when its API
  is too large to hold in mind.

## First real library bootstrap

Do these with the first real dark library, not as a standalone scaffolding task.

1. Add tooling and deterministic docs generation:

   | Tool | Purpose |
   |---|---|
   | `typescript`, `@types/react` (dev) | `src/client/dark/tsconfig.json`: `strict`, `noEmit`, `allowJs: false`, `jsx: react-jsx`, `lib: ["es2022", "dom"]` |
   | `typedoc`, `typedoc-plugin-markdown` (dev) | Per-library `README.md`; `disableSources: true`; include executable examples |
   | `github.com/princjef/gomarkdoc` via Go 1.25 `tool` directive | Per-package `README.md` with source links off |
   | `ts-standard` or `standard --parser` | TS lint parity; choose what works with `standard@17` without an eslint config |

2. Add `scripts/check-dark.sh` enforcing the isolation/no-mock list above,
   public-only contract tests, state/Redux restrictions, action prefixes,
   app deep-import restrictions and generated README freshness. Keep one
   allow/deny list rather than duplicating it across script prose.
   - Client resolution: `tsc -p src/client/dark --listFilesOnly`; fail if a
     listed file's realpath is outside `src/client/dark/` and `node_modules/`.
     This includes re-exports/dynamic imports and rejects a `dekart-proto`
     symlink into `proto/`. Also explicitly reject resolved files under
     `node_modules/dekart-proto/`: `npm run prepare-node-modules` copies proto
     there, so realpath alone cannot exclude it after postinstall. Keep grep
     for app deep imports into dark libraries;
     also check cross-library imports use public entries only.
   - Go resolution: check direct imports, including tests, against the list:
     ```sh
     go list -f '{{join .Imports "\n"}}{{"\n"}}{{join .TestImports "\n"}}{{"\n"}}{{join .XTestImports "\n"}}' ./src/server/dark/...
     ```
     Never use `-deps`: `fmt` transitively imports `os` and must remain allowed.
   - Grep the I/O, clock, randomness, timer and mock restrictions; enforce
     react-redux only in `store.ts` and `<name>/` action type literals. Do not
     confuse function-local variables with module-level state.
3. Add `npm run dark:check` and `make dark-check`; wire checks,
   typecheck, lint, docs regeneration and unit tests into Dockerfile `nodetest`
   and `gotest`. Change gotest's shallow `./src/server/**/` glob to
   `go test -count=1 ./src/server/...` so nested dark packages run. Watch for
   newly included root-package tests.
4. Add `.gitattributes` patterns so implementation collapses in GitHub, with
   test overrides later (README files stay expanded):
   ```gitattributes
   src/client/dark/**/*.ts       linguist-generated=true
   src/client/dark/**/*.tsx      linguist-generated=true
   src/client/dark/**/*.css      linguist-generated=true
   src/server/dark/**/*.go       linguist-generated=true
   src/client/dark/**/*.test.ts  -linguist-generated
   src/client/dark/**/*.test.tsx -linguist-generated
   src/server/dark/**/*_test.go  -linguist-generated
   ```
5. Prove the guards with throwaway local edits, then remove the edits:
   - `make dark-check` fails on `../../lib/api` import or re-export,
     `import('dekart-proto')` in both symlinked and copied installations,
     Go `net/http`, and client `fetch`, `localStorage`,
     `Date.now()` or `setTimeout`.
   - It fails on `vi.mock`, `vi.useFakeTimers`, a client test importing
     `./internal`, or Go tests in `package <name>` instead of `<name>_test`.
   - It fails on `useSelector` outside `store.ts`, unprefixed action types,
     Go `func init()`, client module-level `let`, app deep imports into
     `dark/<lib>/<internal>`, stale README or Go example output drift.
   - A Go library importing `fmt` and `regexp` with a package-level compiled
     regexp passes. Implementation-only edits (private helper rename/line
     reorder) leave generated client/server READMEs byte-identical.
   - A throwaway failing test in `src/server/dark/<name>` fails gotest.
     Verify CI checks, GitHub implementation collapse with visible tests/docs,
     and `vite build` with a TSX dark component rendered from JS glue.

Do not add empty template libraries, permanent guard fixtures, or migrate
existing modules. Run the language-specific proofs when a real library in that
language exists.
