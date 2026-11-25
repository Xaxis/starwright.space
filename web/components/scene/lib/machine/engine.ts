/**
 * A rocket engine, nozzle down: the thrust structure and gimbal, the injector dome, a combustion
 * chamber and bell lined with cooling tubes, a dark nozzle extension that glows as it heats, two
 * turbopumps with their ducts, a manifold ring and the turbine exhaust. When it fires, a plume
 * with shock diamonds streams from the exit. The fleet is a cluster: engines side by side to the
 * edge of sight, the base of a ship too big to see whole.
 */
import { FRAG_HEAD, FRAG_TAIL, NOISE, VERT_HEAD, VERT_TAIL } from "../glsl.ts";
import { type Kit, LOCAL, type Model, ramp } from "./kit.ts";

const EXIT = -2.3;

export default function engine(kit: Kit): Model {
  const { T, m } = kit;
  const root = new T.Group();

  // Cooling tubes run down the chamber and bell: stripes round the lathe's u.
  const tubes = kit.canvas(512, 32, (g) => {
    for (let i = 0; i < 128; i++) {
      const grad = g.createLinearGradient(i * 4, 0, i * 4 + 4, 0);
      grad.addColorStop(0, "#5a3a22");
      grad.addColorStop(0.45, "#c88a55");
      grad.addColorStop(1, "#4a2e1a");
      g.fillStyle = grad;
      g.fillRect(i * 4, 0, 4, 32);
    }
  });
  const bronze = kit.std({
    map: tubes,
    color: "#ffffff",
    metalness: 0.9,
    roughness: 0.35,
    side: T.DoubleSide,
  });
  const prof: [number, number][] = [];
  const throat = 1.55;
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    prof.push([0.24 + 0.81 * t ** 0.62, throat - t * (throat + 1.0)]);
  }
  prof.reverse();
  prof.push([0.3, 1.75], [0.44, 1.98], [0.46, 2.2], [0.46, 2.9]);
  const bell = kit.group(root);
  kit.mesh(kit.lathe(prof, 56), bronze, bell);
  // Bands where the chamber is welded to the bell, and the injector dome.
  kit.mesh(kit.cyl(0.5, 0.5, 0.08, 48), m.steel, bell, [0, 2.2, 0]);
  kit.mesh(kit.cyl(0.5, 0.5, 0.08, 48), m.steel, bell, [0, 2.86, 0]);
  const dome = kit.lathe(
    [
      [0.47, 2.9],
      [0.45, 3.05],
      [0.36, 3.2],
      [0.2, 3.28],
      [0, 3.3],
    ],
    40,
  );
  kit.mesh(dome, m.steel, bell);

  // The nozzle extension, dark until it glows.
  const ext: [number, number][] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    ext.push([1.05 + 0.4 * t ** 0.85, -1.0 + (EXIT + 1.0) * t]);
  }
  ext.reverse();
  const heat = kit.canvas(
    8,
    128,
    (g) => {
      const grad = g.createLinearGradient(0, 0, 0, 128);
      grad.addColorStop(0, "#ffb070");
      grad.addColorStop(0.5, "#c0401a");
      grad.addColorStop(1, "#200500");
      g.fillStyle = grad;
      g.fillRect(0, 0, 8, 128);
    },
    true,
  );
  const extMat = kit.std({
    color: "#3a3532",
    metalness: 0.75,
    roughness: 0.45,
    emissive: "#ffffff",
    emissiveMap: heat,
    emissiveIntensity: 0,
    side: T.DoubleSide,
  });
  const extension = kit.group(root);
  kit.mesh(kit.lathe(ext, 56), extMat, extension);
  const ringG = kit.keep(new T.TorusGeometry(1.08, 0.07, 10, kit.seg(56)));
  ringG.rotateX(Math.PI / 2);
  kit.mesh(ringG, m.steel, extension, [0, -0.98, 0]);
  kit.mesh(
    kit.keep(new T.TorusGeometry(1.45, 0.03, 6, kit.seg(56))).rotateX(Math.PI / 2),
    m.dark,
    extension,
    [0, EXIT, 0],
  );
  kit.part(extension, [0, -2.2, 0], [0, 0.6, 0], 2);

  // The thrust structure: a plate, struts to the gimbal.
  const mount = kit.group(root);
  kit.mesh(kit.cyl(0.18, 0.22, 0.4, 24), m.dark, mount, [0, 3.5, 0]);
  kit.mesh(new T.SphereGeometry(0.2, 20, 14), m.steel, mount, [0, 3.72, 0]);
  const plate = kit.cyl(1.35, 1.35, 0.12, 8);
  kit.solo(kit.mesh(plate, m.dark, mount, [0, 4.1, 0]));
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const strut = kit.tube(
      [
        [0, 3.75, 0],
        [Math.cos(a) * 0.5, 3.92, Math.sin(a) * 0.5],
        [Math.cos(a) * 1.0, 4.04, Math.sin(a) * 1.0],
      ],
      0.045,
      8,
      6,
    );
    kit.mesh(strut, m.alu, mount);
  }
  kit.part(mount, [0, 2.6, 0], [0, 0.8, 0], 0);

  // Two turbopumps and their plumbing.
  const pump = (x: number, z: number, r: number, order: number) => {
    const g = kit.group(root, [x, 2.55, z]);
    kit.mesh(kit.cyl(r, r, 0.8, 28), m.steel, g);
    kit.mesh(kit.cyl(r * 1.25, r * 1.25, 0.12, 28), m.dark, g, [0, 0.3, 0]);
    const turb = kit.keep(new T.TorusGeometry(r * 1.05, r * 0.42, 12, kit.seg(32)));
    turb.rotateX(Math.PI / 2);
    kit.mesh(turb, m.alu, g, [0, -0.42, 0]);
    kit.mesh(kit.cyl(r * 0.7, r * 0.7, 0.4, 20), m.dark, g, [0, 0.6, 0]);
    // Discharge into the injector; a duct down to the manifold.
    const dir = Math.atan2(z, x);
    kit.mesh(
      kit.tube(
        [
          [0, 0.1, 0],
          [-Math.cos(dir) * 0.25, 0.5, -Math.sin(dir) * 0.25],
          [-x * 0.8, 3.1 - 2.55, -z * 0.8],
        ],
        r * 0.38,
        20,
        10,
      ),
      m.steel,
      g,
    );
    kit.mesh(
      kit.tube(
        [
          [0, -0.5, 0],
          [Math.cos(dir) * 0.05, -1.4, Math.sin(dir) * 0.05],
          [-x * 0.05, -2.6, -z * 0.05],
          [-x * 0.12, -3.48, -z * 0.12],
        ],
        r * 0.28,
        24,
        8,
      ),
      m.alu,
      g,
    );
    kit.part(g, [Math.cos(dir) * 1.8, 0.6, Math.sin(dir) * 1.8], [0, 1, 0], order);
    return g;
  };
  pump(0.92, 0.12, 0.2, 3);
  pump(-0.78, -0.42, 0.16, 4);
  // The turbine exhaust, down the outside of the bell.
  const exhaust = kit.group(root);
  kit.mesh(
    kit.tube(
      [
        [0.98, 2.0, 0.5],
        [1.0, 1.0, 0.75],
        [1.1, -0.2, 0.92],
        [1.2, -1.2, 1.0],
      ],
      0.07,
      24,
      8,
    ),
    m.dark,
    exhaust,
  );
  kit.mesh(kit.cyl(0.11, 0.08, 0.2, 16), m.dark, exhaust, [1.2, -1.3, 1.0]);
  kit.part(exhaust, [1.6, -0.6, 1.2], [0, 0, 0.3], 5);

  // The plume: an outer veil and a hot core, both drawn as light.
  const plumeU = {
    uTime: { value: 0 },
    uOn: { value: 0 },
    cColour: { value: kit.accent.clone() },
  };
  const plumeMat = (core: boolean) =>
    kit.keep(
      new T.ShaderMaterial({
        vertexShader: /* glsl */ `
          ${VERT_HEAD}
          varying vec3 vP;
          varying float vFace;
          void main() {
            vP = position;
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
          varying vec3 vP;
          varying float vFace;
          ${NOISE}
          void main() {
            float s = clamp(-vP.y / ${core ? "3.2" : "7.5"}, 0.0, 1.0);
            float fade = pow(max(1.0 - s, 0.0), ${core ? "1.4" : "1.8"});
            float diamonds = 0.6 + 0.4 * pow(max(0.5 + 0.5 * cos(s * ${core ? "22.0" : "9.0"}), 0.0), 3.0);
            float flick = 0.8 + 0.4 * vnoise(vec3(vP.x * 2.0, vP.y * 1.5 + uTime * 9.0, vP.z * 2.0));
            vec3 hot = mix(vec3(1.0, 0.92, 0.8), cColour, ${core ? "0.25" : "0.75"} + 0.25 * s);
            float k = fade * diamonds * flick * pow(vFace, 1.2) * uOn * ${core ? "2.4" : "0.7"};
            gl_FragColor = vec4(hot * k, 1.0);
            ${FRAG_TAIL}
          }`,
        uniforms: plumeU,
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
        side: T.DoubleSide,
      }),
    );
  const plume = kit.group(root, [0, EXIT, 0]);
  const veil: [number, number][] = [];
  const coreP: [number, number][] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    veil.push([1.38 + 2.2 * t ** 0.8, -7.5 * t]);
    coreP.push([0.95 * (1 - 0.55 * t), -3.2 * t]);
  }
  veil.reverse();
  coreP.reverse();
  kit.mesh(kit.lathe(veil, 40), plumeMat(false), plume).userData.noGhost = true;
  kit.mesh(kit.lathe(coreP, 40), plumeMat(true), plume).userData.noGhost = true;
  const flare = kit.glow(
    kit.accent.clone().lerp(new T.Color("#ffffff"), 0.5).multiplyScalar(1.5),
    5,
    plume,
    [0, -0.6, 0],
  );

  return {
    root,
    size: 4.7,
    centre: [0, 0.2, 0],
    setting: "space",
    look: [0.8, 0.1],
    lookFar: 0.14,
    layout: { kind: "grid", spacing: 4.4, count: 520, jitter: 0.03, yaw: "random" },
    update(time, _dt, run, p) {
      // Hundreds of plumes add up: each burns dimmer as the cluster grows, so the whole stays legible.
      const on =
        run * (0.92 + 0.08 * Math.sin(time * 31 + p * 40)) * (1 - 0.72 * ramp(p, 0.5, 0.9));
      plumeU.uTime.value = time + p * 3;
      plumeU.uOn.value = on;
      plume.visible = run > 0.01;
      plume.scale.set(1, 0.4 + 0.6 * run, 1);
      flare.material.opacity = on;
      extMat.emissiveIntensity = 2.2 * run ** 1.5;
    },
  };
}
