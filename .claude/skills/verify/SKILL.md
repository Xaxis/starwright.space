---
name: verify
description: Verify Starwright (the model and data checks in core/, the Next.js site in web/ with its three.js scenes, and the tools that screenshot, render and deploy it). Has the feature map of where every page, metadata route, scene kind, CLI and package export lives, how to launch and health-check the site, and a proven recipe for checking each feature. Use to prove a change in this repo works, to find where a feature lives, or to see what a change could break.
---

# Verify Starwright

`FM=~/.claude/claude-core/bin/featuremap`

- **Where does a feature live?** Look it up in `features.json` (`id`, `entry`, `reach`,
  `tests`), then read `features/<area>.md` for its recipe.
- **What did my change touch?** `$FM affected` (add `--since <base>` on a branch).
  Every feature it lists is in scope.
- **Keeping it current:** when you add, rename, move or remove a feature, run
  `$FM generate --write`, update the matching `features/<area>.md`, and confirm
  `$FM check` exits 0. Commit this with the feature change. Scene kinds, CLIs and assets
  are declared in `featuremap.config.json`.

## Static checks

| Check | Command | Proves | Baseline |
|---|---|---|---|
| lint | `pnpm lint` | biome, types in core and web, the strict data check, the style check (no em dashes, no hand-typed model numbers) | passes |
| test | `pnpm test` | core: format, model behaviour, data rejection cases; web: every scene kind loads, lab defaults are valid | passes |
| build | `heavy pnpm build` | every page renders statically from data/ with the strict data check | passes |
| typecheck:core | `cd core && pnpm typecheck` | core types | passes |
| typecheck:web | `cd web && pnpm typecheck` | site types, after `next typegen` | passes |

Run builds and anything with a browser through `~/.claude/claude-core/bin/heavy` (written `heavy`
below). Known pre-existing failures: none.

## Launch

```sh
cd web && ~/.claude/claude-core/bin/heavy npx next dev --port 4527 > /tmp/starwright-4527.log 2>&1
```

Run it as a background task (not with `&`). Ready when the log says `Ready in`. Port 4527 is this
project's; another session's server may already hold it (see Doctor). Needs nothing else: no
database, no secrets. Production is `pnpm build` then `cd web && npx next start --port 4527`.

## Doctor

```sh
curl -s localhost:4527/ | grep -o '<meta name="starwright-build" content="[^"]*"' \
  && ls -l /proc/$(ss -ltnpH 'sport = :4527' | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)/cwd
```

Proves it when the build meta prints (`dev` under next dev, a commit under a deploy) and the
server's working directory is this checkout's `web/`.

## Drive

- **Pages:** `curl -s -o /dev/null -w '%{http_code}' localhost:4527/<path>`, then read the HTML for
  the text the recipe names.
- **Scenes (WebGL):** `heavy node tools/shot.ts URL OUT.png --progress 0,0.5,1` loads the page in
  Chromium on SwiftShader with reduced motion, moves the story, and writes one PNG per point. It
  prints the canvas dataset (`kind`, `idle`, `progress`, `software`) and console errors. Read the
  PNGs: a scene is proven by what the picture shows, not by the absence of errors.
- **CLIs:** run them; the exit code and the line named in the recipe are the proof.

## Evidence

- Record the command and its decisive output: the status code and the text found, the PNG path
  and what it shows, the exit code.
- A scene recipe needs the screenshots looked at. An empty, black or white frame is a failure.
- If a path is unreachable, name the missing precondition and prove the nearest real path.
  Never report it as verified.

## Cleanup

Stop the dev server task you started (TaskStop), and only that one: other sessions' servers run
on this machine. Screenshots belong in the session scratchpad, not the repo.
