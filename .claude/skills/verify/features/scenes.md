# Scenes

Explore every rung, capability and invention in 3D: one shared WebGL2 canvas, a kind per scene, each telling a story along a 0 to 1 progress.

<!-- covers: scene:*, page:/lab, page:/lab/[kind] -->

## Sub-features

- engine: `web/components/scene/engine.ts`, one renderer (log depth, ACES, bloom), eases the camera to each kind's `pose(progress)`, adapts resolution to frame time, keeps the drawing buffer on software renderers, picks parts under the pointer (`pick`).
- Scene3D: claims the canvas when in view, otherwise shows a still; Explore in 3D opens a full-screen dialog with orbit controls; the story bar plays, pauses and scrubs by beats (arrow keys step); a meter shows the beat's reading.
- kinds: ladder (the hero climb), globe, orbit, moon, swarm, mercury, launch, habitat, reactor, lattice, cell, machine (16 shapes), field, network, replicator, compute, tower (picking opens capability pages; `focus` dims all but one area).
- lab: `/lab/<kind>?params=<json>&story=invention|capability&colour=<hex>` shows any kind with its params checked against `core/src/scenes.ts`.

## How to reach it

- Any page with a scene: home (ladder), `/ladder/<id>`, `/capabilities/<id>`, `/inventions/<id>`, `/tower`, `/domains/<id>` (tower focused), `/builder` (ladder driven by the year).
- `/lab` redirects to `/lab/ladder`; the lab header links every kind.

## How to check it

Static: `pnpm test` (web/test/scenes.test.ts: every kind data may ask for loads and default-exports a kind; lab defaults pass `sceneProblems`). `pnpm lint` checks every record's scene params.

Runtime, one run per kind (the box is shared: batch points, small sizes):

```sh
S=$SCRATCH/shots; mkdir -p $S
heavy node tools/shot.ts http://localhost:4527/ $S/hero.png --size 800x500 --progress 0,0.43,0.86,1
heavy node tools/shot.ts 'http://localhost:4527/lab/reactor?params=%7B%22type%22%3A%22stellarator%22%7D' $S/reactor.png --size 900x600 --progress 0,0.5,1
heavy node tools/shot.ts http://localhost:4527/tower $S/tower.png --size 1100x750 --progress 0.3,1
```

Proves it when: each printed line has `"kind":"<kind>"`, `"idle":"1"`, the requested `progress` and `"errors":[]`, and each PNG shows the scene's subject at that point of the story: today's Earth at night, then the Earth and Moon, then the swarm, then the closed swarm around the Sun for the hero; a lit tower with labelled floors and coloured spokes.

## Gotchas

- Screenshots run on SwiftShader with reduced motion: one settled frame per change, at detail 0.3 and a capped pixel ratio. Real GPUs draw about three times the points; judge composition, not density.
- `--motion` keeps rendering; under heavy load the screenshot itself can time out.
- Points smaller than a pixel fade with their size (`lib/particles.ts`); a scene that looks empty from far away may need its camera closer, not brighter points.
- The sky follows the camera and stays inside its far plane on its own (`makeSky`).
