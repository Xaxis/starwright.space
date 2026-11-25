/**
 * A climber on a tether: a ribbon rising from the Earth far below into the dark, and on it a
 * six-sided climber gripping the ribbon between drive rollers, with radiator wings, a cargo pod,
 * and a receiver dish underneath catching a power beam sent up from the ground. The ribbon slides
 * down through the rollers as it climbs. The fleet is a train of climbers, up and down the ribbon
 * as far as the eye can follow, with more ribbons rising from the horizon.
 */
import type * as THREE from "three";
import { makeEarth } from "../bodies.ts";
import { FRAG_HEAD, FRAG_TAIL, VERT_HEAD, VERT_TAIL } from "../glsl.ts";
import type { Kit, Layout, Model } from "./kit.ts";

const RIB = 0.56;

export default function tether(kit: Kit): Model {
  const { T, m, ctx } = kit;
  const root = new T.Group();
  const layout: Layout = {
    kind: "line",
    spacing: 8,
    count: 140,
    jitter: 0.15,
    yaw: "same",
    axis: [0, 1, 0],
  };
  const perSide = Math.ceil(kit.count(layout.count) / 2);
  const gap = perSide * 8 * 1.15 + 30;
  const ER = gap * 12;
  const up = gap * 3;

  // The ribbon: carbon weave with a bright centre line, scrolling down as the climber rises.
  const weave = kit.canvas(64, 256, (g) => {
    g.fillStyle = "#16181c";
    g.fillRect(0, 0, 64, 256);
    for (let y = 0; y < 256; y += 8) {
      g.fillStyle = y % 16 ? "#1d2026" : "#22262d";
      g.fillRect(0, y, 64, 4);
    }
    g.fillStyle = "#4b5260";
    g.fillRect(30, 0, 4, 256);
  });
  weave.wrapS = weave.wrapT = T.RepeatWrapping;
  weave.repeat.set(1, (gap + up) / 3);
  const ribbonMat = kit.std({ map: weave, metalness: 0.5, roughness: 0.4, side: T.DoubleSide });
  const ribbon = kit.mesh(new T.PlaneGeometry(RIB, gap + up), ribbonMat, root, [
    0,
    (up - gap) / 2,
    0,
  ]);
  kit.solo(ribbon);
  ribbon.userData.noGhost = true;
  for (const s of [-1, 1]) {
    const edge = kit.mesh(kit.box(0.02, gap + up, 0.02), m.strip, root, [
      s * (RIB / 2),
      (up - gap) / 2,
      0,
    ]);
    kit.solo(edge);
    edge.userData.noGhost = true;
  }

  // The climber's body.
  const body = kit.group(root);
  kit.mesh(kit.cyl(0.78, 0.78, 1.25, 6), m.paint, body);
  kit.mesh(kit.cyl(0.8, 0.8, 0.12, 6), m.dark, body, [0, 0.2, 0]);
  kit.mesh(
    kit.keep(new T.TorusGeometry(0.74, 0.02, 6, 6)).rotateX(Math.PI / 2),
    m.strip,
    body,
    [0, -0.5, 0],
    [0, Math.PI / 6, 0],
  );
  kit.part(body, [0, 0, 0], [0, 0, 0], 0);

  // Drive rollers above and below, pinching the ribbon.
  const rollers: THREE.Group[] = [];
  for (const y of [0.9, -0.9]) {
    const g = kit.group(root, [0, y, 0]);
    kit.mesh(kit.box(0.95, 0.12, 0.5, 0.03), m.dark, g, [0, y > 0 ? 0.18 : -0.18, 0]);
    for (const z of [-0.11, 0.11]) {
      const r = kit.group(g, [0, 0, z]);
      kit.spinner(r, "x");
      kit.mesh(kit.cyl(0.095, 0.095, 0.72, 24).rotateZ(Math.PI / 2), m.rubber, r);
      kit.mesh(kit.cyl(0.1, 0.1, 0.05, 24).rotateZ(Math.PI / 2), m.steel, r, [0.37, 0, 0]);
      kit.mesh(kit.cyl(0.1, 0.1, 0.05, 24).rotateZ(Math.PI / 2), m.steel, r, [-0.37, 0, 0]);
      rollers.push(r);
    }
    for (const x of [-0.42, 0.42])
      kit.mesh(kit.box(0.05, 0.3, 0.42, 0.01), m.alu, g, [x, y > 0 ? 0.06 : -0.06, 0]);
    kit.part(g, [0, y > 0 ? 1.2 : -1.2, 0.9], [y > 0 ? 0.6 : -0.6, 0, 0], 1);
  }

  // Radiator wings and the cargo pod.
  for (const s of [-1, 1]) {
    const w = kit.group(root, [s * 1.45, 0.05, 0]);
    kit.mesh(kit.box(1.3, 0.95, 0.03, 0.01), m.alu, w);
    for (let i = 0; i < 6; i++)
      kit.mesh(kit.box(0.03, 0.9, 0.05), m.steel, w, [-0.55 + i * 0.22, 0, 0]);
    kit.mesh(kit.box(0.4, 0.1, 0.1), m.dark, w, [-s * 0.75, 0, 0]);
    kit.part(w, [s * 1.6, 0.4, 0], [0, 0, s * 0.8], 2);
  }
  const pod = kit.group(root, [0, -0.05, 0.98]);
  kit.mesh(kit.keep(new T.CapsuleGeometry(0.3, 0.62, 6, kit.seg(20))), m.paint, pod);
  kit.mesh(kit.box(0.16, 0.36, 0.05, 0.02), m.strip, pod, [0, 0.05, 0.28]);
  kit.part(pod, [0, -0.3, 1.4], [0.5, 0, 0], 3);

  // The receiver dish underneath, facing the beam.
  const rx = kit.group(root, [0, -1.25, 0]);
  const dishP: [number, number][] = [];
  for (let i = 0; i <= 8; i++) {
    const r = (i / 8) * 1.25;
    dishP.push([r, -0.18 * (r / 1.25) ** 2]);
  }
  dishP.reverse();
  const cells = kit.std({ color: "#1a2c55", metalness: 0.5, roughness: 0.25, side: T.DoubleSide });
  kit.mesh(kit.lathe(dishP, 40), cells, rx, [0, 0.18, 0]);
  kit.mesh(
    kit.keep(new T.TorusGeometry(1.25, 0.03, 6, kit.seg(40))).rotateX(Math.PI / 2),
    m.strip,
    rx,
    [0, 0, 0],
  );
  kit.mesh(kit.cyl(0.08, 0.08, 0.3, 12), m.dark, rx, [0, 0.2, 0]);
  kit.part(rx, [0, -1.6, 0], [0, 1.2, 0], 4);

  // The power beam from the ground, drawn only under this climber.
  const beamU = { uTime: { value: 0 }, uOn: { value: 0 }, cColour: { value: kit.accent.clone() } };
  const beamGeo = kit.keep(new T.CylinderGeometry(0.75, 0.75, gap, 24, 1, true));
  const beam = kit.mesh(
    beamGeo,
    kit.keep(
      new T.ShaderMaterial({
        vertexShader: /* glsl */ `
          ${VERT_HEAD}
          varying float vY;
          varying float vFace;
          void main() {
            vY = 0.5 - position.y / ${gap.toFixed(2)};
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vFace = abs(dot(normalize(mat3(modelMatrix) * normal), normalize(cameraPosition - wp.xyz)));
            gl_Position = projectionMatrix * viewMatrix * wp;
            ${VERT_TAIL}
          }`,
        fragmentShader: /* glsl */ `
          ${FRAG_HEAD}
          uniform float uTime;
          uniform float uOn;
          uniform vec3 cColour;
          varying float vY;
          varying float vFace;
          void main() {
            float d = vY * ${gap.toFixed(2)};
            float pulse = 0.6 + 0.4 * sin(d * 1.2 + uTime * 8.0);
            float k = pow(vFace, 2.0) * exp(-d * 0.004) * pulse * uOn * 0.9;
            gl_FragColor = vec4(cColour * k, 1.0);
            ${FRAG_TAIL}
          }`,
        uniforms: beamU,
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
      }),
    ),
    root,
    [0, -1.3 - gap / 2, 0],
  );
  kit.solo(beam);
  beam.userData.noGhost = true;

  // The Earth far below, and other ribbons rising from its horizon.
  const sunPos = new T.Vector3();
  const earth = makeEarth(ctx, { sun: sunPos });
  earth.group.scale.setScalar(ER);
  earth.group.position.set(0, -gap - ER, 0);
  ctx.scene.add(earth.group);
  const others: THREE.Mesh[] = [];
  const faint = kit.std({ color: "#000000", emissive: kit.accent, emissiveIntensity: 0.5 });
  for (const [phi, th] of [
    [0.16, 0.9],
    [0.22, 2.6],
    [0.19, -1.9],
    [0.13, -0.6],
  ] as [number, number][]) {
    const dir = new T.Vector3(
      Math.sin(phi) * Math.cos(th),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(th),
    );
    const line = kit.mesh(kit.box(RIB * 2, gap * 4, RIB * 2), faint, ctx.scene);
    line.position.copy(earth.group.position).addScaledVector(dir, ER + gap * 2);
    line.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir);
    others.push(line);
  }

  return {
    root,
    size: 2.2,
    centre: [0, -0.1, 0],
    setting: "space",
    look: [0.9, 0.02],
    lookFar: 0.3,
    layout,
    update(time, _dt, run, p) {
      const t = time * kit.speed + p * 4;
      weave.offset.y = -t * 0.35;
      for (const [i, r] of rollers.entries()) r.rotation.x = (i % 2 ? 1 : -1) * t * 3;
      beamU.uTime.value = t;
      beamU.uOn.value = run;
      sunPos.copy(kit.sun).multiplyScalar(ER * 1000);
      earth.update(time * 0.2, ctx.camera);
    },
    dispose() {
      earth.dispose();
      ctx.scene.remove(earth.group);
      for (const o of others) ctx.scene.remove(o);
    },
  };
}
