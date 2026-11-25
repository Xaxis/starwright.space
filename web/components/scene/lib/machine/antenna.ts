/**
 * A phased-array antenna on a steerable mount: a pedestal and turntable, a yoke holding a flat
 * panel tipped toward the sky, and on its face a grid of radiating elements. Light runs across
 * the elements in stripes, the phase front that steers the beam, and the beam itself stands off
 * the face as a glowing main lobe with fainter side lobes, sweeping as the phases shift. The
 * fleet is an array of arrays across open ground.
 */
import { FRAG_HEAD, FRAG_TAIL, VERT_HEAD, VERT_TAIL } from "../glsl.ts";
import { type Kit, LOCAL, type Model, ramp } from "./kit.ts";

const AP = 2.9;
const PIVOT = 2.25;
const LOBE = 9;

export default function antenna(kit: Kit): Model {
  const { T, m } = kit;
  const root = new T.Group();
  const concrete = kit.std({ color: "#5b5852", roughness: 0.92 });
  kit.mesh(kit.box(1.6, 0.2, 1.6, 0.03), concrete, root, [0, 0.1, 0]);
  kit.mesh(kit.cyl(0.26, 0.34, 1.25, 32), m.paint, root, [0, 0.82, 0]);
  kit.shadow(2.2, 2.2, root);
  const cab = kit.group(root, [1.1, 0.2, -0.6]);
  kit.mesh(kit.box(0.6, 0.8, 0.45, 0.04), m.paint, cab, [0, 0.4, 0]);
  for (let i = 0; i < 3; i++)
    kit.mesh(new T.SphereGeometry(0.025, 8, 6), m.accent, cab, [-0.1 + i * 0.1, 0.65, 0.23]);
  kit.part(cab, [1.2, 0, 0], [0, 0.6, 0], 0);

  // Turntable and yoke turn in azimuth; the panel tips in elevation.
  const turn = kit.group(root, [0, 1.45, 0]);
  kit.live(turn);
  const tA = kit.group(turn);
  kit.mesh(kit.cyl(0.46, 0.46, 0.16, 36), m.dark, tA);
  kit.mesh(kit.box(2.3, 0.18, 0.42, 0.04), m.paint, tA, [0, 0.16, 0]);
  for (const x of [-1.08, 1.08])
    kit.mesh(kit.box(0.16, 0.95, 0.36, 0.04), m.paint, tA, [x, 0.6, 0]);
  kit.part(tA, [0, 1.2, 0], [0, 1.0, 0], 1);
  const tilt = kit.group(turn, [0, PIVOT - 1.45, 0], [-0.62, 0, 0]);
  const pA = kit.group(tilt);
  kit.mesh(
    kit.box(AP + 0.2, AP + 0.2, 0.22, 0.05),
    kit.std({ color: "#2a2e35", metalness: 0.5, roughness: 0.5 }),
    pA,
    [0, 0, -0.08],
  );
  kit.mesh(kit.cyl(0.09, 0.09, 2.3, 16).rotateZ(Math.PI / 2), m.steel, pA, [0, 0, -0.1]);
  kit.mesh(kit.box(1.2, 0.8, 0.25, 0.04), m.paint, pA, [0, 0, -0.32]);
  kit.part(pA, [0, 2.2, -0.8], [0.6, 0, 0], 2);

  // The elements: a grid of patches, each flying home.
  const n = kit.detail < 1 ? 12 : 16;
  const pitch = AP / n;
  const els = new T.InstancedMesh(kit.box(pitch * 0.62, pitch * 0.62, 0.025), m.gold, n * n);
  const mm = new T.Matrix4();
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      els.setMatrixAt(
        i * n + j,
        mm.makeTranslation(-AP / 2 + (i + 0.5) * pitch, -AP / 2 + (j + 0.5) * pitch, 0.04),
      );
    }
  }
  tilt.add(els);
  for (let i = 0; i < n * n; i++) {
    const r = kit.rand();
    kit.partAt(
      els,
      i,
      [(kit.rand() - 0.5) * 1.5, (kit.rand() - 0.5) * 1.5, 1.5 + r * 1.5],
      [r, 0, r * 2],
      3 + r * 2,
    );
  }

  // The phase front across the face.
  const steer = new T.Vector2();
  const faceU = {
    uTime: { value: 0 },
    uOn: { value: 0 },
    uN: { value: n },
    uSteer: { value: steer },
    cColour: { value: kit.accent.clone() },
  };
  const face = kit.mesh(
    new T.PlaneGeometry(AP, AP),
    kit.keep(
      new T.ShaderMaterial({
        vertexShader: /* glsl */ `
          ${VERT_HEAD}
          varying vec2 vUv;
          void main() {
            vUv = uv;
            ${LOCAL}
            gl_Position = projectionMatrix * modelViewMatrix * local;
            ${VERT_TAIL}
          }`,
        fragmentShader: /* glsl */ `
          ${FRAG_HEAD}
          uniform float uTime;
          uniform float uOn;
          uniform float uN;
          uniform vec2 uSteer;
          uniform vec3 cColour;
          varying vec2 vUv;
          void main() {
            vec2 cell = fract(vUv * uN) - 0.5;
            float pad = smoothstep(0.36, 0.28, max(abs(cell.x), abs(cell.y)));
            vec2 c = (floor(vUv * uN) + 0.5) / uN - 0.5;
            float ph = dot(c, uSteer) * 6.0 + length(c) * 1.5 - uTime * 1.2;
            float b = pow(max(0.5 + 0.5 * sin(ph * 6.2832), 0.0), 3.0);
            gl_FragColor = vec4(cColour * pad * (0.1 + 1.0 * b) * uOn, 1.0);
            ${FRAG_TAIL}
          }`,
        uniforms: faceU,
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
      }),
    ),
    tilt,
    [0, 0, 0.056],
  );
  face.userData.noGhost = true;

  // The beam: a main lobe and side lobes, light that pulses outward.
  const lobeU = { uTime: { value: 0 }, uOn: { value: 0 }, cColour: { value: kit.accent.clone() } };
  const prof: [number, number][] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    prof.push([
      Math.max(0.001, 0.2 * LOBE * Math.sin(Math.PI * t) ** 0.75 * (1 - 0.35 * t)),
      t * LOBE,
    ]);
  }
  const lobeGeo = kit.lathe(prof, 32);
  lobeGeo.rotateX(Math.PI / 2);
  const lobeMat = kit.keep(
    new T.ShaderMaterial({
      vertexShader: /* glsl */ `
        ${VERT_HEAD}
        varying float vS;
        varying float vFace;
        void main() {
          vS = position.z / ${LOBE.toFixed(1)};
          ${LOCAL}
          vec3 nrm = normal;
          #ifdef USE_INSTANCING
          nrm = mat3(instanceMatrix) * nrm;
          #endif
          vec4 wp = modelMatrix * local;
          vFace = abs(dot(normalize(mat3(modelMatrix) * nrm), normalize(cameraPosition - wp.xyz)));
          gl_Position = projectionMatrix * viewMatrix * wp;
          ${VERT_TAIL}
        }`,
      fragmentShader: /* glsl */ `
        ${FRAG_HEAD}
        uniform float uTime;
        uniform float uOn;
        uniform vec3 cColour;
        varying float vS;
        varying float vFace;
        void main() {
          float fade = pow(max(1.0 - vS, 0.0), 1.3);
          float rings = 0.45 + 0.55 * pow(max(0.5 + 0.5 * sin(vS * 40.0 - uTime * 5.0), 0.0), 2.0);
          float k = fade * rings * pow(vFace, 1.5) * uOn * 0.3;
          gl_FragColor = vec4(cColour * k, 1.0);
          ${FRAG_TAIL}
        }`,
      uniforms: lobeU,
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      side: T.DoubleSide,
    }),
  );
  const beam = kit.group(tilt, [0, 0, 0.06]);
  const main = kit.mesh(lobeGeo, lobeMat, beam);
  main.userData.noGhost = true;
  for (const [ax, ay] of [
    [0.62, 0],
    [-0.62, 0],
    [0, 0.6],
    [0, -0.6],
  ] as [number, number][]) {
    const side = kit.mesh(lobeGeo, lobeMat, beam, [0, 0, 0], [ay, ax, 0]);
    side.scale.setScalar(0.28);
    side.userData.noGhost = true;
  }

  return {
    root,
    size: 3.1,
    centre: [0, 2.0, 0],
    setting: "ground",
    look: [0.45, 0.2],
    lookFar: 0.22,
    layout: { kind: "grid", spacing: [8, 8.5], count: 420, jitter: 0.15, yaw: 0.05 },
    update(time, _dt, run, p) {
      const t = time * kit.speed + p * 5;
      turn.rotation.y = 0.25 * Math.sin(t * 0.15) * run;
      const az = 0.42 * Math.sin(t * 0.37);
      const el = 0.3 * Math.sin(t * 0.23 + 1);
      steer.set(Math.sin(az), Math.sin(el));
      beam.rotation.set(-el, az, 0);
      const on = run * ramp(p, 0.2, 0.32);
      faceU.uTime.value = t;
      faceU.uOn.value = (0.15 + 0.85 * on) * kit.fade;
      lobeU.uTime.value = t;
      lobeU.uOn.value = on * kit.fade * kit.fade;
      beam.visible = on > 0.01;
    },
  };
}
