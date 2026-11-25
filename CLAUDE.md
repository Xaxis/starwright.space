# Starwright

An open builder of every technology and plan humanity needs to climb the Kardashev scale, first to
Type I, then Type II, published at starwright.space. The repository is the source of truth; the
site renders it, and every stage, capability and invention is explorable in 3D.

## Rules that are easy to break

- **Feasibility is not a filter.** Where a technology is missing, this project invents it. Nothing
  is ruled out for seeming hard; every invention instead ships with the principle it works on, the
  first experiment that would prove it (setup, measure, success criterion, cost, months) and its
  path from the bench to civilization scale. `risks` says what could go wrong and what to try next,
  never a verdict.
- **What exists is cited; what is invented is labelled.** A capability's `exists` and an
  invention's `buildsOn` cite real sources with working URLs, so the work builds on them rather
  than reinventing them. Inventions are always shown as this project's proposals, untested until an
  experiment runs.
- **Every number comes from the model.** Measured inputs live in `data/constants.yaml` (each with
  its source and quote), chosen ones in `data/assumptions.yaml` (each with its basis and range);
  everything else is derived in `core/src/model.ts`. Prose writes a model number as `{id}`; never
  type one by hand. `node tools/style.ts` catches copies.
- **Every number shows its basis**: physics, precedent, invented or choice. Keep it honest.
- **No em dashes**, anywhere: data, docs, code, comments, commit messages.
- **Every scene is a contract.** A record's `scene.kind` and `scene.params` must match
  `core/src/scenes.ts`; `web/components/scene/kinds/` draws each kind. A kind's story runs along
  progress 0 to 1: a capability grows from what exists to its target, an invention through its path.

## Commands

```sh
pnpm model                        # the ladder: each rung's power and year, and each era's limit
pnpm model --only <id>            # one quantity: value, formula, inputs
pnpm model --set id=value         # a variant
pnpm check:data                   # parse and cross-check data/
pnpm lint                         # biome, types, the data check, style
pnpm test
pnpm build                        # the site
tools/deploy.sh                   # production deploy of HEAD, then proves it live
heavy node tools/shot.ts URL OUT.png --progress 0,0.5,1   # screenshots along a scene's story
heavy node tools/og.ts            # the share card, from the running site's hero
heavy node tools/icons.ts         # favicon.ico and apple-icon.png from web/app/icon.svg
```

`/lab/<kind>?params=<json>&story=invention|capability` shows any scene kind on its own, for building
and reviewing scenes. Screenshots run on SwiftShader with reduced motion: one settled frame each, at
the low detail a software renderer gets.

Port 4527 for this project's dev server. Heavy work (builds, browser runs, renders) goes through
`~/.claude/claude-core/bin/heavy`; Chromium stays on SwiftShader (`tools/lib/chromium.ts`).

## Layout

`data/` inputs and content (constants, assumptions, domains, stages, `capabilities/<domain>/`,
`inventions/<domain>/`), `core/` the schema, model and checks (browser-safe; `core/src/load.ts` is
Node only), `web/` the Next.js site and its 3D engine (`web/components/scene/`), `tools/` style,
checks and deploy.

`.claude/skills/verify/` says how to launch, drive and prove each feature.

## Deploy

Vercel project `starwright` in the `xaxis-projects` team. `tools/deploy.sh` uploads a git archive of
HEAD (uncommitted work is not deployed), waits for it and proves the live site serves that commit.
`VERCEL_TOKEN` is in `.env`, never on a command line. Until the owner registers starwright.space the
site lives at its vercel.app address; then run deploys with `STARWRIGHT_APEX=starwright.space` and
the script attaches the domain and its www redirect. Never buy a domain without the owner's yes.
