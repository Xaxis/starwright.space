# Upstream

Starwright began from [Phosphoros](https://github.com/Xaxis/phosphoros.space), the same owner's plan
for an Earth-like Venus. These parts were copied from it on 2026-11-24 and have changed since:

| Here | From Phosphoros | What changed |
| --- | --- | --- |
| `web/app/globals.css` (base, header, footer, menus) | `web/app/globals.css` | Starwright's scenes, cards, ledger and Builder added |
| `web/components/AllPagesMenu.tsx`, `ThemeToggle.tsx`, `web/lib/theme-script.ts` | same paths | names only |
| `web/tsconfig.json`, `core/tsconfig.json`, `.gitignore` | `web/tsconfig.json`, `calc/tsconfig.json`, `.gitignore` | none |
| `tools/lib/vercel.sh`, `tools/lib/chromium.ts` | same paths | none |
| `tools/deploy.sh` | `tools/deploy.sh` | project `starwright`; the custom domain is optional until registered |
| `web/public/maps/*.jpg` | `web/public/` | NASA imagery; credits in `web/public/maps/README.md` |
| `core/src/load.ts` root finder | `calc/src/load.ts` | none |

The 3D engine, the scene kinds, the model and the data are Starwright's own.
