# Pages

Read the climb: the ladder and its rungs, the tower, every area, capability and invention, the Builder, where to start, every number and source.

<!-- covers: page:/, page:/about, page:/builder, page:/capabilities/[id], page:/domains, page:/domains/[id], page:/inventions, page:/inventions/[id], page:/ladder, page:/ladder/[id], page:/numbers, page:/sources, page:/start, page:/tower, api:GET /manifest.webmanifest, api:GET /robots.txt, api:GET /sitemap.xml -->

## Sub-features

- home: the hero climb (ladder scene), the rungs with K, power and year, why Type I is climbed in space, every area, the cheapest first experiments.
- ladder: `/ladder` lists the rungs and the eras; `/ladder/<id>` shows one rung's scene, limit and plan steps.
- tower: `/tower` is the 3D map of every capability plus a floor-by-floor list.
- areas: `/domains` and `/domains/<id>`, with the tower focused on that area.
- records: `/capabilities/<id>` (target, what exists, gap, inventions, links) and `/inventions/<id>` (principle, first experiment, path, builds on, risks, an issue link to report a run).
- builder: sliders rerun the model in the browser; rungs re-date, the chart redraws, the scene moves to the chosen year; `?set=id=value,...` keeps a variant.
- start: every first experiment, cheapest first, with what it unlocks.
- numbers and sources: the ledger of every quantity, every cited source by area.
- metadata routes: `/sitemap.xml` lists every page, `/robots.txt`, `/manifest.webmanifest`.

## How to reach it

- The header: The Ladder, The Tower, Inventions, Builder, Start Here; the menu button lists every page including Every Area, Every Number, Every Source, About.
- Record pages from any card, chip or tower node (click a node in the 3D tower).
- `/builder?set=doubling-time=4` opens a variant.

## How to check it

Static: `pnpm lint` (types, the strict data check), `heavy pnpm build` renders every page.

Runtime:

```sh
for p in / /ladder /ladder/type-1 /tower /domains /domains/energy /capabilities/self-replicating-factory \
  /inventions /inventions/seed-foundry /builder /start /numbers /sources /about; do
  printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' localhost:4527$p)" "$p"; done
curl -s localhost:4527/sitemap.xml | grep -c '<loc>'
curl -s localhost:4527/inventions/seed-foundry | grep -o 'The first experiment'
curl -s localhost:4527/numbers | grep -o 'id="year-type-1"'
heavy node tools/shot.ts 'http://localhost:4527/builder?set=doubling-time=4' /tmp/b.png --size 1300x1000 --full
```

Proves it when: every path prints 200; the sitemap count equals 1 + 1 + rungs + 1 + inventions + 1 + 1 + 1 + areas + capabilities + 3 (see `web/app/sitemap.ts`); the invention page has its experiment and the ledger has the anchor every `{id}` link points to. In the Builder shot, the knobs panel says "1 choice changed", the doubling-time output reads "4 years" and the "This variant" column shows later years than "Published" with a red `+N yr`.

## Gotchas

- Dev loads data leniently (anything that parses); the production build insists on every reference. Run `pnpm check:data` to see what the build would reject.
- The Builder reads `?set=` once on load, then writes the link as choices change.
- A page's scene only renders while it is the one in view: one canvas is shared and moves between scenes.
