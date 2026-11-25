/**
 * Light that runs along drawn paths: a canvas holds, per pixel, whether a path is there (red),
 * how far along it the pixel is (green, scaled by red so antialiased edges stay true) and a seed
 * for its phase (blue). The shader sends pulses along the paths or flickers each region, added
 * over a surface so bloom catches them. Works on instanced copies too.
 */
import type * as THREE from "three";
import { FRAG_HEAD, FRAG_TAIL, VERT_HEAD, VERT_TAIL } from "../glsl.ts";
import { type Kit, LOCAL } from "./kit.ts";

export interface GlowMap {
  material: THREE.ShaderMaterial;
  /** Seconds of motion, and how much of the light is on. */
  uniforms: { uTime: { value: number }; uOn: { value: number } };
}

/**
 * mode "run": pulses travel outward along each path (`waves` per unit of along).
 * mode "flicker": each region (its seed) breathes at its own phase.
 */
export function glowMap(
  kit: Kit,
  map: THREE.Texture,
  mode: "run" | "flicker",
  waves = 4,
  gain = 1,
): GlowMap {
  const { T } = kit;
  const uniforms = {
    uMap: { value: map },
    uTime: { value: 0 },
    uOn: { value: 0 },
    uWaves: { value: waves },
    uGain: { value: gain },
    cColour: { value: kit.accent.clone() },
  };
  const material = kit.keep(
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
        uniform sampler2D uMap;
        uniform float uTime;
        uniform float uOn;
        uniform float uWaves;
        uniform float uGain;
        uniform vec3 cColour;
        varying vec2 vUv;
        void main() {
          vec4 t = texture2D(uMap, vUv);
          float mask = t.r;
          if (mask < 0.01) discard;
          float along = t.g / max(t.r, 0.02);
          float seed = t.b / max(t.r, 0.02);
          float light;
          ${
            mode === "run"
              ? `float ph = fract(along * uWaves - uTime * 0.5 + seed * 7.0);
                 light = 0.1 + 2.8 * pow(smoothstep(0.7, 1.0, ph), 2.0) * step(seed, 0.85);`
              : `float b = 0.5 + 0.5 * sin(uTime * 2.2 + seed * 47.0);
                 light = 0.18 + 1.6 * pow(b, 5.0) + 0.6 * smoothstep(0.92, 1.0, fract(along - uTime * 0.25));`
          }
          vec3 c = cColour * mask * light * uOn * uGain;
          gl_FragColor = vec4(c, 1.0);
          ${FRAG_TAIL}
        }`,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  return { material, uniforms };
}

/** Draws a path into a glow canvas: red for the path, green for how far along, blue its seed. */
export function strokePath(
  g: CanvasRenderingContext2D,
  pts: [number, number][],
  width: number,
  scale: number,
  seed: number,
) {
  let along = 0;
  g.lineWidth = width;
  g.lineCap = "round";
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1] as [number, number];
    const [x1, y1] = pts[i] as [number, number];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(len / 3));
    for (let k = 0; k < steps; k++) {
      const a = k / steps;
      const b = (k + 1) / steps;
      const v = Math.min(255, Math.round(((along + len * a) / scale) * 255));
      g.strokeStyle = `rgb(255,${v},${Math.round(seed * 255)})`;
      g.beginPath();
      g.moveTo(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a);
      g.lineTo(x0 + (x1 - x0) * b, y0 + (y1 - y0) * b);
      g.stroke();
    }
    along += len;
  }
}
