# Model

Rerun the climb: the ladder's powers and years, each era's limit, any single quantity with its formula, and variants.

<!-- covers: cli:model, cli:check-data, export:@starwright/core, export:@starwright/core/*, export:@starwright/core/load -->

## Sub-features

- model: `pnpm model` prints each rung's power, K and year, and the eras; `--only <id>` one quantity with formula and inputs; `--set id=value` a variant; `--ids` every quantity.
- check-data: `pnpm check:data` parses and cross-checks every file in data/, listing every problem with its file.
- exports: `@starwright/core` (browser-safe: schema, model, format, templates, scene params), `@starwright/core/load` (Node only: reads data/).

## How to reach it

- `pnpm model ...`, `pnpm check:data`, or `node core/cli.ts ...` from the repo root.
- The site imports `@starwright/core` (the Builder runs `run()` in the browser) and `@starwright/core/load` at build time.

## How to check it

Static: `pnpm test` (core/test/model.test.ts, data.test.ts, format.test.ts).

Runtime:

```sh
pnpm model | head -12
pnpm model --only year-type-1
pnpm model --set doubling-time=1 --only year-type-2
pnpm model --set collector-density=3.92 --only year-type-2
pnpm check:data; echo "exit $?"
```

Proves it when: the ladder lists the eight rungs with years in order; `--only` prints a value, its formula and inputs; halving the doubling time gives an earlier Type II than the published one; A&S's 3.92 kg/m2 collectors print "never"; `check:data` prints `data ok: ...` and exits 0.

## Gotchas

- Commands other than `--check` load data leniently, so a half-written record still lets you run the model; only `--check` (and the build) is strict.
- A changed published number is visible across the site at once; check the pages that cite it.
