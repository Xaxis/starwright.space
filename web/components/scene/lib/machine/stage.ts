/**
 * Where a machine stands, and the light it is seen by. Outdoors at dusk on open ground, on a dark
 * factory floor, or in space by a hard sun. Each has reflections from a studio environment, a key
 * light, a cool rim light, and a backdrop that fades the far fleet into a horizon.
 */
import type * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { makeSky } from "../bodies.ts";
import { FRAG_HEAD, FRAG_TAIL, NOISE, VERT_HEAD, VERT_TAIL } from "../glsl.ts";
import type { Kit, Setting } from "./kit.ts";

export interface Stage {
  /** The direction the key light comes from. */
  sun: THREE.Vector3;
  /** far: 0 for the close shots, 1 once the camera has pulled back over the fleet. */
  update(camera: THREE.PerspectiveCamera, distance: number, far: number): void;
  dispose(): void;
}

const DOME_VERT = /* glsl */ `
${VERT_HEAD}
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  ${VERT_TAIL}
}`;

const DOME_FRAG = /* glsl */ `
${FRAG_HEAD}
uniform vec3 cHorizon;
uniform vec3 cZenith;
uniform vec3 cGlow;
uniform vec3 uSun;
uniform float uStars;
varying vec3 vDir;
${NOISE}
void main() {
  vec3 d = normalize(vDir);
  float up = pow(clamp(d.y, 0.0, 1.0), 0.42);
  vec3 c = mix(cHorizon, cZenith, up);
  float s = max(dot(d, normalize(uSun)), 0.0);
  c += cGlow * (pow(s, 5.0) * 0.8 + pow(s, 60.0) * 1.5) * (1.0 - up * 0.6);
  // A band of brighter air just above the horizon.
  c += cGlow * 0.18 * exp(-abs(d.y) * 18.0);
  float star = step(0.9975, hash13(floor(d * 520.0))) * smoothstep(0.15, 0.6, d.y) * uStars;
  c += vec3(star * 0.6);
  if (d.y < 0.0) c = cHorizon * (1.0 + d.y * 0.6);
  gl_FragColor = vec4(c, 1.0);
  ${FRAG_TAIL}
}`;

export function makeStage(kit: Kit, setting: Setting, size: number, az: number): Stage {
  const { T, ctx } = kit;
  const { scene, renderer } = ctx;
  const own: { dispose(): void }[] = [];

  // Reflections: a studio room, blurred into an environment map.
  const pmrem = new T.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, 0.04);
  room.dispose();
  pmrem.dispose();
  own.push(env);
  scene.environment = env.texture;
  scene.environmentIntensity = setting === "space" ? 0.2 : setting === "floor" ? 0.4 : 0.3;
  scene.environmentRotation.set(0, az, 0);

  // The key light comes from the camera's left and above; the rim from behind on the right.
  const dir = (a: number, e: number) =>
    new T.Vector3(Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a));
  const sun = dir(az - 0.95, setting === "space" ? 0.35 : 0.42);
  kit.sun.copy(sun);
  const key = new T.DirectionalLight(
    setting === "space" ? "#fff3e2" : "#ffd9b5",
    setting === "space" ? 2.6 : 1.7,
  );
  key.position.copy(sun).multiplyScalar(size * 10);
  const rim = new T.DirectionalLight("#8fb2ff", setting === "space" ? 0.4 : 1.0);
  rim.position.copy(dir(az + Math.PI - 0.5, 0.35)).multiplyScalar(size * 10);
  scene.add(key, rim);
  if (setting !== "space") {
    const hemi = new T.HemisphereLight("#6f82ad", "#191510", setting === "floor" ? 0.35 : 0.4);
    scene.add(hemi);
  }

  let dome: THREE.Mesh | undefined;
  let sky: { mesh: THREE.Mesh; dispose(): void } | undefined;
  let fog: THREE.FogExp2 | undefined;
  /** The Sun itself, far off along the key light: a wide glow and a hot core, as shares of far. */
  const suns: [THREE.Sprite, number][] = [];
  if (setting === "space") {
    sky = makeSky(ctx, 1);
    own.push(sky);
    scene.add(sky.mesh);
    suns.push([kit.glow(new T.Color("#ffd9a8").multiplyScalar(0.45), 1, scene), 0.05]);
    suns.push([kit.glow(new T.Color("#ffffff").multiplyScalar(3), 1, scene), 0.012]);
  } else {
    const horizon = new T.Color(setting === "floor" ? "#10131b" : "#1d2030").lerp(kit.accent, 0.06);
    const zenith = new T.Color(setting === "floor" ? "#040508" : "#04060d");
    const glowC =
      setting === "floor" ? new T.Color("#23262e") : new T.Color("#a8603a").lerp(kit.accent, 0.12);
    const domeGeo = kit.keep(new T.SphereGeometry(1, 48, 24));
    const domeMat = kit.keep(
      new T.ShaderMaterial({
        vertexShader: DOME_VERT,
        fragmentShader: DOME_FRAG,
        uniforms: {
          cHorizon: { value: horizon },
          cZenith: { value: zenith },
          cGlow: { value: glowC },
          uSun: { value: sun.clone().setY(0.05) },
          uStars: { value: setting === "floor" ? 0 : 1 },
        },
        side: T.BackSide,
        depthWrite: false,
      }),
    );
    dome = new T.Mesh(domeGeo, domeMat);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    scene.add(dome);
    fog = new T.FogExp2(horizon.clone(), 0.01);
    scene.fog = fog;

    // The ground: a vast disc, tiled with a texture that gives the eye a sense of scale.
    const tile = size * 2.2;
    const radius = size * 900;
    const tex =
      setting === "floor"
        ? kit.canvas(256, 256, (g) => {
            g.fillStyle = "#15171c";
            g.fillRect(0, 0, 256, 256);
            for (let i = 0; i < 900; i++) {
              const v = 18 + Math.floor(kit.rand() * 10);
              g.fillStyle = `rgb(${v},${v + 1},${v + 4})`;
              g.fillRect(
                kit.rand() * 256,
                kit.rand() * 256,
                2 + kit.rand() * 6,
                2 + kit.rand() * 6,
              );
            }
            g.strokeStyle = "rgba(150,160,190,0.22)";
            g.lineWidth = 2;
            g.strokeRect(0, 0, 256, 256);
            g.strokeStyle = "rgba(150,160,190,0.07)";
            g.lineWidth = 1;
            for (let i = 1; i < 4; i++) {
              g.beginPath();
              g.moveTo(i * 64, 0);
              g.lineTo(i * 64, 256);
              g.moveTo(0, i * 64);
              g.lineTo(256, i * 64);
              g.stroke();
            }
          })
        : kit.canvas(256, 256, (g) => {
            g.fillStyle = "#1b1916";
            g.fillRect(0, 0, 256, 256);
            for (let i = 0; i < 2600; i++) {
              const v = kit.rand();
              const r = 20 + v * 22;
              g.fillStyle = `rgba(${r},${r * 0.95},${r * 0.82},0.6)`;
              const s = 1 + kit.rand() * 5;
              g.fillRect(kit.rand() * 256, kit.rand() * 256, s, s);
            }
          });
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.repeat.set((radius * 2) / tile, (radius * 2) / tile);
    const groundMat = kit.std({
      map: tex,
      color: "#ffffff",
      roughness: setting === "floor" ? 0.55 : 0.95,
      metalness: setting === "floor" ? 0.25 : 0,
      envMapIntensity: setting === "floor" ? 0.8 : 0.2,
    });
    const ground = kit.mesh(
      new T.CircleGeometry(radius, 96),
      groundMat,
      scene,
      [0, 0, 0],
      [-Math.PI / 2, 0, 0],
    );
    ground.renderOrder = -5;
  }

  const tmp = new T.Vector3();
  return {
    sun,
    update(camera, distance, farness) {
      const far = camera.far * 0.45;
      if (dome) {
        dome.position.copy(camera.position);
        dome.scale.setScalar(far);
      }
      // Close up, the fog only softens the far ground; pulled back, it hides the fleet's edge.
      if (fog) fog.density = (0.9 + 1.1 * farness) / (distance + size * (12 - 9 * farness));
      for (const [s, k] of suns) {
        tmp.copy(sun).multiplyScalar(far * 0.9);
        s.position.copy(camera.position).add(tmp);
        s.scale.setScalar(far * k);
      }
    },
    dispose() {
      for (const x of own) x.dispose();
      scene.environment = null;
      scene.fog = null;
    },
  };
}
