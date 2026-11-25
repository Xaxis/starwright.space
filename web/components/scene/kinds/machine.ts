/**
 * One machine, from the bench to civilization scale. The story opens close on the machine in an
 * exploded view, its outline drawn in light where each part belongs; the parts fly home one after
 * another, and the machine starts to work. From the middle of the story it multiplies: a copy,
 * then a few, then a fleet in powers of ten, while the camera pulls back until the copies reach
 * the horizon. Every shape is its own model, built in lib/machine/ from three's primitives.
 *
 * Params: shape (which machine) and spin (how fast its main motion runs, 0 to 1).
 */
import type * as THREE from "three";
import { makeFleet } from "../lib/machine/fleet.ts";
import { assembler, type Kit, type Model, makeKit, mix, ramp } from "../lib/machine/kit.ts";
import { SHAPES, type Shape } from "../lib/machine/shapes.ts";
import { makeStage } from "../lib/machine/stage.ts";
import type { Beat, Kind, View } from "../types.ts";

/** When the machine is whole, when it runs at full work, and when the copies begin. */
const BUILT = 0.24;
const RUNNING: [number, number] = [0.12, 0.42];
const MULTIPLY = 0.5;

const machine: Kind = (ctx) => {
  const T = ctx.three;
  const kit = makeKit(ctx);
  const shape =
    (String(ctx.params.shape ?? "turbine") as Shape) in SHAPES
      ? (ctx.params.shape as Shape)
      : "turbine";
  const model = SHAPES[shape](kit);
  ctx.scene.add(model.root);

  const [az0, el0] = model.look ?? [0.85, 0.3];
  const s = model.size;
  const centre = new T.Vector3(...model.centre);
  const azF = az0 + 1.05;
  const elF =
    model.lookFar ??
    (model.setting === "space" ? 0.38 : model.layout.kind === "volume" ? 0.16 : 0.2);
  // Copies stretch away from the final camera, so the far shot looks across them.
  const fwd = new T.Vector2(-Math.cos(azF), -Math.sin(azF));
  const fleet = makeFleet(kit, model.root, model.layout, fwd);
  ctx.scene.add(fleet.group);
  const stage = makeStage(kit, model.setting, s, az0);
  const ghost = makeGhost(kit, model);
  const assemble = assembler(kit);

  /** Copies showing at progress p: none, then one, a few, tens, hundreds, in powers of the most. */
  const copies = (p: number) =>
    p <= MULTIPLY ? 0 : Math.max(0, fleet.max ** ((p - MULTIPLY) / (1 - MULTIPLY)) - 1);
  const far = (p: number) => {
    const reach = fleet.reach(copies(p));
    return model.layout.kind === "line" ? reach * 0.9 + s * 3 : reach * 0.95 + s * 2.2;
  };

  // The camera's path: keys every quarter of the story, joined smoothly.
  const keys = [
    { d: 3.3 * (model.start ?? s), az: az0 - 0.3, el: el0 + 0.1, ahead: 0, drop: 0 },
    { d: 2.7 * mix(model.start ?? s, s, 0.6), az: az0 + 0.1, el: el0, ahead: 0, drop: 0 },
    { d: 3.0 * s, az: az0 + 0.45, el: el0 + 0.04, ahead: 0, drop: 0 },
    {
      d: Math.max(3.4 * s, far(0.75)),
      az: az0 + 0.8,
      el: mix(el0, elF, 0.7),
      ahead: 0.2,
      drop: 0.5,
    },
    { d: Math.max(4 * s, far(1)), az: azF, el: elF, ahead: 0.38, drop: 0.8 },
  ];
  const cr = (a: number, b: number, c: number, d: number, u: number) =>
    0.5 *
    (2 * b +
      (c - a) * u +
      (2 * a - 5 * b + 4 * c - d) * u * u +
      (3 * b - a - 3 * c + d) * u * u * u);
  const at = (p: number, f: (k: (typeof keys)[number]) => number) => {
    const x = Math.min(0.99999, Math.max(0, p)) * (keys.length - 1);
    const i = Math.floor(x);
    const u = x - i;
    const k = (j: number) =>
      f(keys[Math.min(keys.length - 1, Math.max(0, j))] as (typeof keys)[number]);
    return cr(k(i - 1), k(i), k(i + 1), k(i + 2), u);
  };
  const target = new T.Vector3();
  const pos = new T.Vector3();
  const pose = (p: number): View => {
    const d = Math.exp(at(p, (k) => Math.log(k.d)));
    const az = at(p, (k) => k.az);
    const el = at(p, (k) => k.el);
    const ahead = at(p, (k) => k.ahead);
    const drop =
      model.setting === "space"
        ? 0
        : Math.min(
            1,
            Math.max(
              0,
              at(p, (k) => k.drop),
            ),
          );
    target.copy(centre);
    target.y *= 1 - drop * 0.6;
    if (model.layout.kind !== "line") target.x += fwd.x * d * ahead;
    if (model.layout.kind !== "line") target.z += fwd.y * d * ahead;
    pos
      .set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az))
      .multiplyScalar(d)
      .add(target);
    if (model.setting !== "space") pos.y = Math.max(pos.y, s * 0.15);
    return {
      position: [pos.x, pos.y, pos.z],
      target: [target.x, target.y, target.z],
      near: s * 0.8,
      far: Math.max(d * 3, s * 12),
    };
  };

  const beats = ((ctx.data as { beats?: Omit<Beat, "at">[] } | undefined)?.beats ?? []).map(
    (b, i, all) => ({
      ...b,
      at: all.length > 1 ? i / (all.length - 1) : 0,
    }),
  );

  const look = new T.Vector3();
  return {
    view: pose(0),
    beats,
    pose,
    update(time, dt, p) {
      const a = ramp(p, 0.01, BUILT);
      assemble(a);
      ghost.set(a);
      const run = ramp(p, RUNNING[0], RUNNING[1]);
      kit.fade = 1 - 0.6 * ramp(p, MULTIPLY + 0.05, 1);
      kit.m.accent.emissiveIntensity = 3 * kit.fade;
      kit.m.strip.emissiveIntensity = 1.3 * kit.fade;
      kit.m.lamp.emissiveIntensity = 4 * kit.fade;
      model.update(time, dt, run, p);
      model.root.updateMatrixWorld(true);
      fleet.show(copies(p));
      fleet.update();
      ctx.camera.getWorldPosition(look);
      stage.update(ctx.camera, look.distanceTo(centre), ramp(p, MULTIPLY + 0.1, 1));
    },
    dispose() {
      model.dispose?.();
      model.root.traverse(
        (o) => (o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).dispose(),
      );
      fleet.dispose();
      ghost.dispose();
      stage.dispose();
      kit.dispose();
    },
  };
};

/** The machine's outline in light, drawn where each part belongs, fading as the parts arrive. */
function makeGhost(kit: Kit, model: Model) {
  const { T } = kit;
  model.root.updateMatrixWorld(true);
  const inv = model.root.matrixWorld.clone().invert();
  const mat = kit.keep(
    new T.LineBasicMaterial({
      color: kit.accent.clone().multiplyScalar(1.6),
      transparent: true,
      opacity: 0.5,
      blending: T.AdditiveBlending,
      depthWrite: false,
    }),
  );
  const group = new T.Group();
  model.root.add(group);
  kit.solo(group);
  const moving = new Set(kit.parts.map((x) => x.obj));
  model.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (
      !m.isMesh ||
      (m as THREE.InstancedMesh).isInstancedMesh ||
      o.userData.solo ||
      o.userData.noGhost
    )
      return;
    let inPart = false;
    for (let a: THREE.Object3D | null = o; a; a = a.parent) if (moving.has(a)) inPart = true;
    if (!inPart) return;
    const edges = kit.keep(new T.EdgesGeometry(m.geometry, 32));
    const line = new T.LineSegments(edges, mat);
    line.matrixAutoUpdate = false;
    line.matrix.copy(inv).multiply(m.matrixWorld);
    group.add(line);
  });
  return {
    set(a: number) {
      mat.opacity = 0.3 * (1 - a) ** 0.7;
      group.visible = a < 0.999;
    },
    dispose() {},
  };
}

export default machine;
