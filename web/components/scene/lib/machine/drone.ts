/**
 * A delivery drone, hovering: a white hull with a dark canopy and a strip of light, four carbon
 * arms to motor pods, two-bladed propellers spinning to a blur, a camera on its gimbal, landing
 * skids, navigation lights and a parcel held underneath. The fleet is a swarm filling the sky.
 */
import type * as THREE from "three";
import { type Kit, type Model, ramp } from "./kit.ts";

const HOVER = 2.6;
const REACH = 0.82;

export default function drone(kit: Kit): Model {
  const { T, m } = kit;
  const root = new T.Group();
  const shadow = kit.shadow(1.3, 1.3, root, [0, 0.005, 0], 0.55);
  kit.solo(shadow);

  const body = kit.group(root, [0, HOVER, 0]);
  kit.live(body);
  const carbon = kit.std({ color: "#1b1d21", roughness: 0.35, metalness: 0.4 });

  // Hull, canopy, light strip.
  const hull = kit.group(body);
  kit.mesh(kit.box(0.92, 0.24, 0.6, 0.1), m.paint, hull);
  const dome = kit.keep(new T.SphereGeometry(0.3, kit.seg(32), 16, 0, Math.PI * 2, 0, Math.PI / 2));
  const canopy = kit.std({ color: "#0d1117", metalness: 0.6, roughness: 0.12 });
  kit.mesh(dome, canopy, hull, [0.06, 0.1, 0]).scale.set(1.3, 0.55, 0.85);
  for (const z of [-0.305, 0.305])
    kit.mesh(kit.box(0.7, 0.025, 0.01), m.accent, hull, [0, -0.02, z]);
  kit.part(hull, [0, 1.0, 0], [0, 0.6, 0], 0);

  // Arms, motors, propellers.
  const props: THREE.Group[] = [];
  const bladeGeo = kit.box(0.27, 0.012, 0.055, 0.006);
  const blurMat = kit.std({
    color: "#cfd6e0",
    transparent: true,
    opacity: 0.09,
    roughness: 0.4,
    depthWrite: false,
    side: T.DoubleSide,
  });
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const armG = kit.group(body);
    const armGeo = kit.cyl(0.035, 0.045, REACH - 0.2, 14);
    armGeo.rotateZ(Math.PI / 2);
    kit.mesh(
      armGeo,
      carbon,
      armG,
      [dx * (REACH / 2 + 0.05), 0.02, dz * (REACH / 2 + 0.05)],
      [0, -a, 0],
    );
    const pod = kit.group(armG, [dx * REACH, 0.06, dz * REACH]);
    kit.mesh(kit.cyl(0.07, 0.08, 0.16, 20), carbon, pod);
    kit.mesh(
      kit.keep(new T.TorusGeometry(0.075, 0.012, 6, 20)).rotateX(Math.PI / 2),
      m.accent,
      pod,
      [0, -0.04, 0],
    );
    // Front lights in the record's colour, rear ones white.
    kit.mesh(new T.SphereGeometry(0.025, 8, 6), dx > 0 ? m.accent : m.lamp, pod, [
      dx * 0.08,
      -0.07,
      dz * 0.08,
    ]);
    const prop = kit.group(pod, [0, 0.1, 0]);
    kit.spinner(prop, "y");
    kit.mesh(kit.cyl(0.03, 0.03, 0.04, 12), m.steel, prop);
    for (const s of [-1, 1])
      kit.mesh(bladeGeo, carbon, prop, [s * 0.15, 0.01, 0], [s * 0.18, 0, 0]);
    const blur = kit.mesh(
      kit.keep(new T.CircleGeometry(0.31, kit.seg(32))),
      blurMat,
      prop,
      [0, 0.012, 0],
      [-Math.PI / 2, 0, 0],
    );
    blur.userData.noGhost = true;
    props.push(prop);
    kit.part(armG, [dx * 0.9, 0.2, dz * 0.9], [0, (k % 2 ? 1 : -1) * 0.8, 0], 1 + k * 0.3);
    kit.part(prop, [0, 0.9, 0], [0, 2, 0], 3 + k * 0.3);
  }

  // Skids, gimbal camera, parcel.
  const gear = kit.group(body);
  for (const z of [-0.26, 0.26]) {
    kit.mesh(kit.cyl(0.018, 0.018, 0.9, 10).rotateZ(Math.PI / 2), carbon, gear, [0, -0.42, z]);
    for (const x of [-0.25, 0.25])
      kit.mesh(kit.cyl(0.015, 0.015, 0.32, 8), carbon, gear, [x, -0.27, z * 0.85], [z * 0.6, 0, 0]);
  }
  kit.part(gear, [0, -0.9, 0], [0, 0, 0], 2);
  const cam = kit.group(body, [0.38, -0.16, 0]);
  kit.mesh(kit.box(0.06, 0.08, 0.06), m.dark, cam, [0, 0.02, 0]);
  kit.mesh(new T.SphereGeometry(0.075, 16, 12), m.dark, cam, [0, -0.06, 0]);
  kit.mesh(kit.cyl(0.035, 0.035, 0.03, 16).rotateZ(Math.PI / 2), m.accent, cam, [0.07, -0.06, 0]);
  kit.part(cam, [0.7, -0.3, 0], [0, 0, 1], 2.5);
  const parcel = kit.group(body, [-0.05, -0.31, 0]);
  kit.mesh(kit.box(0.36, 0.2, 0.3, 0.015), kit.std({ color: "#b48a58", roughness: 0.85 }), parcel);
  kit.mesh(kit.box(0.37, 0.205, 0.04), kit.std({ color: "#d9d2c3", roughness: 0.7 }), parcel);
  kit.part(parcel, [0, -1.2, 0], [0, 0.6, 0], 4.5);

  return {
    root,
    size: 1.35,
    centre: [0, HOVER - 0.05, 0],
    setting: "ground",
    look: [0.7, 0.2],
    lookFar: 0.08,
    layout: {
      kind: "volume",
      spacing: 4.2,
      count: 760,
      jitter: 0.45,
      yaw: "random",
      height: [-1.5, 12],
      tumble: 0.06,
    },
    update(time, _dt, run, p) {
      const t = time * kit.speed + p * 3;
      body.position.y = HOVER + 0.06 * Math.sin(t * 1.3) * run + 0.2 * ramp(p, 0.15, 0.35);
      body.rotation.z = 0.04 * Math.sin(t * 0.9) * run;
      body.rotation.x = 0.03 * Math.sin(t * 0.7 + 1) * run;
      props.forEach((pr, i) => {
        pr.rotation.y = (i % 2 ? 1 : -1) * (time * 28 * run + p * 50 + i);
      });
      blurMat.opacity = 0.03 + 0.09 * run;
    },
  };
}
