/**
 * An electric motor in cutaway, its shaft along x: a finned housing on feet, opened over one
 * quarter so the inside shows; a stator of stacked laminations with copper coils wound round
 * its teeth; a rotor faced with magnets, spinning on its shaft; an open front bell, a fan cover
 * behind and a terminal box with its cables. The magnetic field turns round the air gap as light.
 * The fleet is a factory floor of motors.
 */
import type * as THREE from "three";
import { FRAG_HEAD, FRAG_TAIL, VERT_HEAD, VERT_TAIL } from "../glsl.ts";
import { type Kit, LOCAL, type Model } from "./kit.ts";

const L = 1.5;
const AXIS = 1.5;
const DEG = Math.PI / 180;
/** The cut: the housing and stator are open between these angles (0 faces +z, 90 faces up). */
const OPEN: [number, number] = [-12 * DEG, 102 * DEG];

/** A cross-section in the y-z plane, as a shape whose extrusion becomes the x axis. */
function section(
  kit: Kit,
  outer: (a: number) => number,
  inner: (a: number) => number,
  step: number,
) {
  const { T } = kit;
  const pt = (a: number, r: number) => new T.Vector2(-r * Math.cos(a), r * Math.sin(a));
  const a0 = OPEN[1];
  const a1 = OPEN[0] + Math.PI * 2;
  const n = Math.ceil((a1 - a0) / step);
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push(pt(a, outer(a)));
  }
  for (let i = n; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push(pt(a, inner(a)));
  }
  return new T.Shape(pts);
}

function extrude(kit: Kit, shape: THREE.Shape, depth: number) {
  const { T } = kit;
  const g = new T.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -depth / 2);
  g.rotateY(Math.PI / 2);
  g.computeVertexNormals();
  return kit.keep(g);
}

export default function motor(kit: Kit): Model {
  const { T, m } = kit;
  const root = new T.Group();
  const step = (kit.detail < 1 ? 2 : 1) * DEG;
  const inOpen = (a: number) => {
    const x = (((a - OPEN[0]) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return x < OPEN[1] - OPEN[0];
  };
  const body = kit.std({ color: "#4f5d70", metalness: 0.55, roughness: 0.42 });

  // Housing, finned and cut open, on its feet.
  const fin = (a: number) => {
    const k = (((a / DEG) % 15) + 15) % 15;
    return k < 5 ? 1.38 : 1.22;
  };
  const housing = kit.mesh(
    extrude(
      kit,
      section(kit, fin, () => 1.06, step),
      L + 0.5,
    ),
    body,
    root,
    [0, AXIS, 0],
  );
  housing.userData.noGhost = true;
  for (const x of [-0.7, 0.7]) {
    kit.mesh(kit.box(0.42, AXIS - 0.9, 2.1, 0.04), body, root, [x, (AXIS - 0.9) / 2, 0]);
    kit.mesh(kit.box(0.6, 0.08, 2.5, 0.03), m.dark, root, [x, 0.04, 0]);
  }
  kit.shadow(2.6, 1.9, root);

  // The stator: laminations stacked along the shaft.
  const slot = (a: number) => {
    const k = (((a / DEG) % 15) + 15) % 15;
    return k > 3.5 && k < 11.5 ? 0.94 : 0.72;
  };
  const sheets = Math.round(14 * (0.6 + 0.4 * kit.detail));
  const gap = L / sheets;
  const lam = extrude(
    kit,
    section(kit, () => 1.06, slot, step * 0.5),
    gap * 0.86,
  );
  const steel = kit.std({ color: "#5e646d", metalness: 0.9, roughness: 0.32 });
  const stator = new T.InstancedMesh(lam, steel, sheets);
  const mm = new T.Matrix4();
  for (let i = 0; i < sheets; i++) {
    stator.setMatrixAt(i, mm.makeTranslation(-L / 2 + gap * (i + 0.5), AXIS, 0));
  }
  root.add(stator);
  for (let i = 0; i < sheets; i++)
    kit.partAt(stator, i, [0, 2.4 + i * 0.05, 0], [0.4, 0, 0], 1 + i * 0.12);

  // Copper coils wound round each tooth, their end turns bulging out past the stack.
  const rc = 0.83;
  const w = 0.085;
  const e = L / 2 + 0.12;
  const coilGeo = kit.tube(
    [
      [-e, 0, -w],
      [e, 0, -w],
      [e + 0.14, 0.02, 0],
      [e, 0, w],
      [-e, 0, w],
      [-e - 0.14, 0.02, 0],
    ],
    0.055,
    40,
    8,
    true,
  );
  const teeth: number[] = [];
  for (let k = 0; k < 24; k++) {
    const a = (k * 15 + 7.5 + 7.5) * DEG;
    if (!inOpen(a)) teeth.push(a);
  }
  const coils = new T.InstancedMesh(coilGeo, m.copper, teeth.length);
  const q = new T.Quaternion();
  const one = new T.Vector3(1, 1, 1);
  const pv = new T.Vector3();
  teeth.forEach((a, i) => {
    // Local y is radial: rotate y to the tooth's direction about x.
    q.setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2 - a);
    pv.set(0, AXIS + rc * Math.sin(a), rc * Math.cos(a));
    coils.setMatrixAt(i, mm.compose(pv, q, one));
  });
  root.add(coils);
  for (const [i, a] of teeth.entries()) {
    kit.partAt(
      coils,
      i,
      [0, Math.sin(a) * 1.6 + 0.6, Math.cos(a) * 1.6],
      [0.8, 0, 0],
      3 + i * 0.08,
    );
  }

  // The rotor: magnets round a steel core, on a shaft with a key and a pulley.
  const rotorG = kit.group(root, [0, AXIS, 0]);
  const rotor = kit.group(rotorG);
  kit.spinner(rotor, "x");
  const core = kit.cyl(0.6, 0.6, L, 40);
  core.rotateZ(Math.PI / 2);
  kit.mesh(core, kit.std({ color: "#3a3f47", metalness: 0.9, roughness: 0.35 }), rotor);
  const magGeo = kit.box(L * 0.96, 0.07, 0.4, 0.015);
  const north = kit.std({
    color: kit.accent.clone().multiplyScalar(0.8),
    metalness: 0.5,
    roughness: 0.3,
  });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    kit.mesh(
      magGeo,
      k % 2 ? m.dark : north,
      rotor,
      [0, 0.635 * Math.sin(a), 0.635 * Math.cos(a)],
      [Math.PI / 2 - a, 0, 0],
    );
  }
  const shaft = kit.cyl(0.13, 0.13, 4.1, 24);
  shaft.rotateZ(Math.PI / 2);
  kit.mesh(shaft, m.steel, rotor, [0.15, 0, 0]);
  kit.mesh(kit.box(0.5, 0.05, 0.06), m.dark, rotor, [1.85, 0.13, 0]);
  const pulley = kit.lathe(
    [
      [0.13, -0.18],
      [0.42, -0.18],
      [0.42, -0.1],
      [0.36, -0.06],
      [0.36, 0.06],
      [0.42, 0.1],
      [0.42, 0.18],
      [0.13, 0.18],
    ],
    40,
  );
  pulley.rotateZ(Math.PI / 2);
  kit.mesh(pulley, m.alu, rotor, [1.95, 0, 0]);
  kit.part(rotorG, [3.6, 0.2, 0], [0, 0, 0], 6);

  // The field turning round the air gap.
  const shellGeo = kit.keep(new T.CylinderGeometry(0.69, 0.69, L * 0.98, kit.seg(64), 1, true));
  shellGeo.rotateZ(Math.PI / 2);
  const fieldU = { uTime: { value: 0 }, uOn: { value: 0 }, cColour: { value: kit.accent.clone() } };
  const fieldMat = kit.keep(
    new T.ShaderMaterial({
      vertexShader: /* glsl */ `
        ${VERT_HEAD}
        varying vec3 vP;
        void main() {
          vP = position;
          ${LOCAL}
          gl_Position = projectionMatrix * modelViewMatrix * local;
          ${VERT_TAIL}
        }`,
      fragmentShader: /* glsl */ `
        ${FRAG_HEAD}
        uniform float uTime;
        uniform float uOn;
        uniform vec3 cColour;
        varying vec3 vP;
        void main() {
          float a = atan(vP.y, vP.z);
          float lobe = pow(max(0.5 + 0.5 * cos(2.0 * (a - uTime)), 0.0), 6.0);
          float ends = smoothstep(0.75, 0.2, abs(vP.x) / ${(L / 2).toFixed(3)});
          vec3 c = cColour * (0.08 + 1.6 * lobe) * ends * uOn;
          gl_FragColor = vec4(c, 1.0);
          ${FRAG_TAIL}
        }`,
      uniforms: fieldU,
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      side: T.DoubleSide,
    }),
  );
  const field = kit.mesh(shellGeo, fieldMat, root, [0, AXIS, 0]);
  field.userData.noGhost = true;

  // The front bell: an open ring on spokes, so the windings stay in view. The back: a fan cover.
  const front = kit.group(root, [L / 2 + 0.32, AXIS, 0]);
  const ring = kit.keep(new T.TorusGeometry(1.16, 0.07, 10, kit.seg(56)));
  ring.rotateY(Math.PI / 2);
  kit.mesh(ring, body, front);
  const hubG = kit.cyl(0.3, 0.34, 0.24, 32);
  hubG.rotateZ(Math.PI / 2);
  kit.mesh(hubG, body, front);
  for (let k = 0; k < 4; k++) {
    const a = ((k + 0.5) / 4) * Math.PI * 2 + Math.PI / 4;
    const spoke = kit.box(0.1, 0.86, 0.12, 0.03);
    kit.mesh(
      spoke,
      body,
      front,
      [0, 0.73 * Math.sin(a), 0.73 * Math.cos(a)],
      [Math.PI / 2 - a, 0, 0],
    );
  }
  kit.mesh(
    kit.keep(new T.TorusGeometry(0.33, 0.04, 8, 32)).rotateY(Math.PI / 2),
    m.accent,
    front,
    [0.13, 0, 0],
  );
  kit.part(front, [2.4, 0.4, 0], [0.6, 0, 0], 7);
  const back = kit.group(root, [-L / 2 - 0.3, AXIS, 0]);
  const cover = kit.lathe(
    [
      [1.24, 0.26],
      [1.24, 0],
      [1.18, -0.42],
      [0.95, -0.62],
      [0.35, -0.7],
      [0, -0.7],
    ],
    48,
  );
  cover.rotateZ(Math.PI / 2);
  kit.mesh(cover, body, back);
  for (let k = 1; k < 5; k++) {
    const g = kit.keep(new T.TorusGeometry(0.22 * k, 0.025, 6, 40)).rotateY(Math.PI / 2);
    kit.mesh(g, m.dark, back, [-0.71, 0, 0]);
  }
  kit.part(back, [-2.4, 0.3, 0], [0, 0, 0], 8);

  // The terminal box and its cables.
  const box = kit.group(root, [-0.2, AXIS + 1.28, -0.45]);
  kit.mesh(kit.box(0.7, 0.36, 0.6, 0.06), body, box);
  kit.mesh(kit.box(0.6, 0.04, 0.5, 0.02), m.dark, box, [0, 0.2, 0]);
  kit.mesh(new T.SphereGeometry(0.05, 10, 8), m.accent, box, [0.25, 0.23, 0.18]);
  for (const z of [-0.12, 0.12]) {
    kit.mesh(kit.cyl(0.07, 0.07, 0.16, 16), m.dark, box, [z, -0.05, -0.32], [Math.PI / 2, 0, 0]);
    const cable = kit.tube(
      [
        [z, -0.05, -0.38],
        [z, -0.2, -0.8],
        [z * 1.5, -1.4, -1.3],
        [z * 2, -AXIS - 1.2, -1.5],
      ],
      0.05,
      24,
      8,
    );
    kit.mesh(cable, m.rubber, box);
  }
  kit.part(box, [0, 1.6, -0.4], [0, 0.8, 0], 9);

  return {
    root,
    size: 2.7,
    centre: [0.2, AXIS - 0.05, 0],
    setting: "floor",
    look: [0.92, 0.3],
    layout: { kind: "grid", spacing: [5.8, 4.4], count: 640, jitter: 0, yaw: "same" },
    update(time, _dt, run, p) {
      const t = time * kit.speed * 5 * run + p * 9;
      rotor.rotation.x = -t;
      fieldU.uTime.value = t * 0.5;
      fieldU.uOn.value = (0.1 + 0.9 * run) * kit.fade;
    },
  };
}
