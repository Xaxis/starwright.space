/**
 * A segmented space telescope: eighteen hexagonal mirror segments on a dark backplane, curved
 * to one focus, a secondary mirror held out on three struts, the tower that lifts the optics off
 * a five-layer sunshield, and the spacecraft bus beneath with its solar panel and dish. The
 * segments fly in and tile the mirror; light gathers to the secondary. The fleet is an array of
 * telescopes spread through space.
 */
import { FRAG_HEAD, FRAG_TAIL, VERT_HEAD, VERT_TAIL } from "../glsl.ts";
import { type Kit, LOCAL, type Model } from "./kit.ts";

const F = 3.2;
const PITCH = 0.92;

const GOLD = "#e9c77e";

export default function telescope(kit: Kit): Model {
  const { T, m } = kit;
  const root = new T.Group();
  const obs = kit.group(root);
  kit.spinner(obs, "y");

  // The spacecraft bus, its panel and its dish.
  const bus = kit.group(obs, [0, -0.75, 0]);
  kit.mesh(kit.box(1.3, 0.62, 1.3, 0.04), m.gold, bus);
  kit.mesh(kit.box(1.32, 0.05, 1.32), m.dark, bus, [0, 0.33, 0]);
  const cells = kit.std({ color: "#13244a", metalness: 0.5, roughness: 0.25 });
  kit.mesh(kit.box(2.6, 0.04, 1.0, 0.01), cells, bus, [-1.9, -0.1, 0.0], [0, 0, 0.35]);
  const dish = kit.lathe(
    [
      [0, -0.06],
      [0.15, -0.055],
      [0.3, -0.035],
      [0.42, 0.0],
    ],
    32,
  );
  const dishMat = kit.std({ color: "#d8d9dc", roughness: 0.4, side: T.DoubleSide });
  kit.mesh(dish, dishMat, bus, [0.4, -0.45, 0.5], [Math.PI, 0, 0.3]);
  kit.mesh(new T.SphereGeometry(0.04, 8, 6), m.accent, bus, [0.66, 0.1, 0.66]);
  kit.part(bus, [0, -2.0, 0], [0, 0.6, 0], 0);

  // The sunshield: five layers, each a little smaller and higher.
  const shieldMat = kit.std({
    color: "#c4b3d6",
    metalness: 0.85,
    roughness: 0.28,
    side: T.DoubleSide,
    emissive: "#2a1a3a",
  });
  for (let k = 0; k < 5; k++) {
    const s = 1 - k * 0.05;
    const shape = new T.Shape();
    const pts: [number, number][] = [
      [-4.2, 0],
      [-2.3, -1.9],
      [2.3, -1.9],
      [4.2, 0],
      [2.3, 1.9],
      [-2.3, 1.9],
    ];
    for (const [i, [x, y]] of pts.entries()) {
      if (i) shape.lineTo(x * s, y * s);
      else shape.moveTo(x * s, y * s);
    }
    const g = kit.keep(new T.ShapeGeometry(shape));
    g.rotateX(-Math.PI / 2);
    const layer = kit.mesh(g, shieldMat, obs, [0, k * 0.11, 0]);
    kit.part(layer, [0, -1.2 + k * 0.5, 0], [0, 0, 0], 1 + k * 0.25);
  }

  // The tower and the optics on it, tipped back to look up and out.
  const tower = kit.mesh(kit.box(0.28, 1.4, 0.28, 0.03), m.dark, obs, [0, 1.15, -0.3]);
  kit.part(tower, [0, 1.2, 0], [0, 0, 0], 2.5);
  const optics = kit.group(obs, [0, 2.4, -0.2], [-0.62, 0, 0]);
  kit.live(optics);
  const back = kit.cyl(2.35, 2.35, 0.2, 6);
  back.rotateX(Math.PI / 2);
  const plate = kit.std({ color: "#1d2026", metalness: 0.4, roughness: 0.6 });
  const backplane = kit.mesh(back, plate, optics, [0, 0, -0.22], [0, 0, Math.PI / 6]);
  kit.part(backplane, [0, 0, -1.4], [0, 0, 0.4], 3);

  // Eighteen segments in two rings round an empty centre, each tipped toward the focus.
  const cells2: [number, number][] = [];
  for (let q = -2; q <= 2; q++) {
    for (let r = -2; r <= 2; r++) {
      if (Math.abs(q + r) > 2 || (q === 0 && r === 0)) continue;
      cells2.push([PITCH * (q + r / 2), (PITCH * r * Math.sqrt(3)) / 2]);
    }
  }
  const segGeo = kit.cyl(0.5, 0.5, 0.06, 6);
  segGeo.rotateX(Math.PI / 2);
  // Gold over beryllium, as on the real ones; a touch rough so the room's lamps do not glare in it.
  const mirror = kit.std({ color: GOLD, metalness: 1, roughness: 0.42, envMapIntensity: 1.2 });
  const segs = new T.InstancedMesh(segGeo, mirror, cells2.length);
  const mm = new T.Matrix4();
  const e = new T.Euler();
  const q = new T.Quaternion();
  const one = new T.Vector3(1, 1, 1);
  const p = new T.Vector3();
  cells2.forEach(([x, y], i) => {
    p.set(x, y, (x * x + y * y) / (4 * F));
    e.set(-y / (2 * F), x / (2 * F), 0);
    segs.setMatrixAt(i, mm.compose(p, q.setFromEuler(e), one));
  });
  optics.add(segs);
  cells2.forEach(([x, y], i) => {
    const d = Math.hypot(x, y);
    kit.partAt(
      segs,
      i,
      [(x / d) * 2.2, (y / d) * 2.2, 2.4],
      [0.4, 0.6, 0],
      4 + (i / cells2.length) * 3,
    );
  });

  // Struts and the secondary mirror.
  const sec = kit.group(optics, [0, 0, F * 0.88]);
  kit.mesh(kit.cyl(0.3, 0.3, 0.06, 32).rotateX(Math.PI / 2), mirror, sec);
  kit.mesh(kit.cyl(0.32, 0.32, 0.12, 32).rotateX(Math.PI / 2), m.dark, sec, [0, 0, 0.08]);
  kit.part(sec, [0, 0, 2.5], [0, 0, 1], 8);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
    const strut = kit.tube(
      [
        [Math.cos(a) * 2.1, Math.sin(a) * 2.1, 0.05],
        [Math.cos(a) * 1.1, Math.sin(a) * 1.1, F * 0.45],
        [Math.cos(a) * 0.32, Math.sin(a) * 0.32, F * 0.86],
      ],
      0.03,
      16,
      6,
    );
    kit.part(
      kit.mesh(strut, m.alu, optics),
      [Math.cos(a) * 1.2, Math.sin(a) * 1.2, 1.2],
      [0, 0, 0],
      7.5,
    );
  }

  // Light gathering to the secondary: a faint cone, solo so the fleet stays clean.
  const coneGeo = kit.keep(new T.CylinderGeometry(0.3, 2.2, F * 0.86, kit.seg(48), 1, true));
  coneGeo.rotateX(Math.PI / 2);
  const coneU = { uOn: { value: 0 }, uTime: { value: 0 }, cColour: { value: kit.accent.clone() } };
  const cone = kit.mesh(
    coneGeo,
    kit.keep(
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
          uniform float uOn;
          uniform float uTime;
          uniform vec3 cColour;
          varying vec3 vP;
          void main() {
            float s = vP.z / ${(F * 0.86).toFixed(3)} + 0.5;
            float bands = 0.6 + 0.4 * sin(s * 30.0 + uTime * 4.0);
            gl_FragColor = vec4(cColour * 0.18 * bands * uOn * (0.3 + s), 1.0);
            ${FRAG_TAIL}
          }`,
        uniforms: coneU,
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
        side: T.DoubleSide,
      }),
    ),
    optics,
    [0, 0, (F * 0.86) / 2],
  );
  cone.userData.noGhost = true;
  kit.solo(cone);
  const focus = kit.glow(kit.accent.clone().multiplyScalar(1.4), 0.45, sec, [0, 0, -0.06], 0);

  return {
    root,
    size: 4.6,
    centre: [0, 1.1, 0],
    setting: "space",
    look: [0.75, 0.22],
    lookFar: 0.3,
    layout: {
      kind: "volume",
      spacing: 15,
      count: 300,
      jitter: 0.3,
      yaw: "random",
      height: [-7, 7],
      tumble: 0.25,
    },
    update(time, _dt, run, p) {
      obs.rotation.y = 0.15 * Math.sin(time * 0.05 * kit.speed) + p * 0.6;
      optics.rotation.y = 0.12 * Math.sin(time * 0.11 * kit.speed + 1) * run;
      coneU.uOn.value = run;
      // Hundreds of mirrors glinting at once would bloom into fog: they dull as the fleet grows.
      const dull = (1 - kit.fade) / 0.6;
      mirror.color.set(GOLD).multiplyScalar(1 - 0.3 * dull);
      mirror.roughness = 0.42 + 0.33 * dull;
      coneU.uTime.value = time * kit.speed + p * 3;
      focus.material.opacity = 0.7 * run;
    },
  };
}
