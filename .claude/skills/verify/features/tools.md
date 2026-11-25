# Tools

Check the writing, look at scenes, render the share card and icons, and deploy.

<!-- covers: cli:style, cli:shot, cli:og, cli:icons, cli:deploy -->

## Sub-features

- style: `node tools/style.ts` fails on em or spaced en dashes in tracked files and on model numbers copied by hand into data prose.
- shot: `tools/shot.ts URL OUT.png [--size WxH] [--progress a,b,c] [--full] [--motion]` screenshots a page, optionally at points of its scene's story.
- og: `tools/og.ts [url] [progress]` writes web/app/opengraph-image.png (1200 x 630) and its alt text from the hero.
- icons: `tools/icons.ts` renders web/app/icon.svg into apple-icon.png and favicon.ico.
- deploy: `tools/deploy.sh` deploys HEAD to Vercel project `starwright` and proves it live; `--check [SHA]` only proves.

## How to reach it

- From the repo root: `node tools/style.ts`; the others under `~/.claude/claude-core/bin/heavy node tools/<tool>.ts`; `tools/deploy.sh`.

## How to check it

Static: biome and types cover tools/ through `pnpm lint`.

Runtime:

```sh
node tools/style.ts; echo "exit $?"
heavy node tools/shot.ts http://localhost:4527/ $SCRATCH/home.png --size 800x500
heavy node tools/icons.ts && file web/app/favicon.ico web/app/apple-icon.png
heavy node tools/og.ts http://localhost:4527 && file web/app/opengraph-image.png
tools/deploy.sh --check
```

Proves it when: style prints `style ok (N files)`; shot prints a JSON line with the scene's dataset and writes a PNG that shows the page; icons gives a 3-icon ICO and a 180 x 180 PNG; og gives a 1200 x 630 PNG showing the headline over the swarm; `deploy.sh --check` ends `site ok: <sha> is live at https://...` with every sitemap page 200.

## Gotchas

- `tools/deploy.sh` without `--check` ships to production: run it only to deploy. It deploys HEAD, not the working tree.
- `VERCEL_TOKEN` comes from `.env` (git-ignored); never put it on a command line.
- Until starwright.space is registered the live site is the project's vercel.app address; `STARWRIGHT_APEX=starwright.space tools/deploy.sh` attaches the domain once the owner has bought it.
