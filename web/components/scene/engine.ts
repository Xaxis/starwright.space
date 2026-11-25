/**
 * One WebGL canvas for the whole page. Browsers allow only a handful of live WebGL contexts, and a
 * page here may hold many scenes, so the canvas moves to whichever scene the reader is looking at;
 * the others keep a still picture of their last frame. Loaded on demand: the page's text reads
 * before any of this arrives.
 *
 * Checks and tools read canvas.dataset: kind (the scene shown), idle ("1" once the frame asked for
 * is drawn and nothing moves) and progress.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { KINDS, type KindName } from "./kinds/index.ts";
import type { Beat, KindWorld, Params, Picked, View } from "./types.ts";

export interface ShowOptions {
  kind: KindName;
  params: Params;
  colour: string;
  data?: unknown;
  /** Where the story starts, 0 to 1. */
  progress?: number;
  /** Play the story on its own (the hero) or wait for the reader. */
  autoplay?: boolean;
  /** Seconds the whole story takes when it plays. */
  duration?: number;
}

export interface Engine {
  canvas: HTMLCanvasElement;
  /** Builds a scene, replacing the one shown. Resolves once its first frame is drawn. */
  show(o: ShowOptions): Promise<KindWorld>;
  attach(host: HTMLElement): void;
  /** Lets the reader turn and zoom the camera. */
  setInteractive(on: boolean): void;
  setVisible(on: boolean): void;
  /** What lies under a point of the canvas, given in CSS pixels from its top left. */
  pick(x: number, y: number): Picked | undefined;
  setProgress(p: number): void;
  play(): void;
  pause(): void;
  playing(): boolean;
  beats(): Beat[];
  resetView(): void;
  /** The current frame as a data URL, for the still picture a scene keeps when the canvas leaves. */
  snapshot(): string;
  on(f: (e: { progress: number; playing: boolean }) => void): () => void;
  dispose(): void;
}

const REDUCED =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function webgl2(): boolean {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

export function createEngine(): Engine {
  const canvas = document.createElement("canvas");
  canvas.className = "scene-canvas";
  canvas.setAttribute("aria-hidden", "true");
  // A software renderer (SwiftShader, or a machine without a GPU) draws every pixel on the CPU:
  // fewer points, no multisampling and a lower resolution keep it usable. It also keeps its last
  // frame, since an idle scene (reduced motion) draws only once and a software compositor may read
  // the canvas again after the buffer has been cleared.
  const software = /swiftshader|llvmpipe|software/i.test(gpuName());
  canvas.dataset.software = software ? "1" : "0";
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !software,
    powerPreference: "high-performance",
    preserveDrawingBuffer: software,
    // The climb spans a city's lights to the whole Sun: one depth buffer has to hold both.
    logarithmicDepthBuffer: true,
  });
  renderer.setClearColor("#04050a");
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1e5);
  let scene = new THREE.Scene();
  const composer = new EffectComposer(
    renderer,
    new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: software ? 0 : 4 }),
  );
  const pass = new RenderPass(scene, camera);
  composer.addPass(pass);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.45, 0.82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enabled = false;
  controls.enablePan = false;
  /** The reader has taken the camera: the story's own camera stops steering it. */
  let taken = false;
  controls.addEventListener("start", () => {
    taken = true;
    request();
  });
  controls.addEventListener("change", () => request());

  let world: KindWorld | undefined;
  let host: HTMLElement | undefined;
  let visible = true;
  let playing = false;
  let progress = 0;
  let duration = 40;
  let time = 0;
  let raf = 0;
  let last = 0;
  let width = 0;
  let height = 0;
  let build = 0;
  /** Lowered while frames run slow, so a weak GPU loses sharpness rather than smoothness. */
  let dprCap = software ? 0.75 : 2;
  let frameTime = 1 / 60;
  let sinceResize = 0;
  function adapt(dt: number) {
    if (!dt) return;
    frameTime += (dt - frameTime) * 0.08;
    sinceResize++;
    const dpr = renderer.getPixelRatio();
    if (frameTime > 1 / 30 && sinceResize > 45 && dpr > 0.5) {
      dprCap = Math.max(0.5, dpr - 0.25);
      sinceResize = 0;
      frameTime = 1 / 40;
      resize();
    }
  }
  const listeners = new Set<(e: { progress: number; playing: boolean }) => void>();
  const emit = () => {
    for (const f of listeners) f({ progress, playing });
  };

  function resize() {
    if (!host) return;
    const r = host.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    const dpr = Math.min(window.devicePixelRatio || 1, w < 800 ? 1.5 : 1.75, dprCap);
    if (w !== width || h !== height || renderer.getPixelRatio() !== dpr) {
      width = w;
      height = h;
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      composer.setPixelRatio(dpr);
      composer.setSize(w, h);
      bloom.resolution.set(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }
  const observer = new ResizeObserver(() => {
    resize();
    request();
  });

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const easeTo = new THREE.Vector3();
  const easeTarget = new THREE.Vector3();
  function apply(view: View, k: number) {
    easeTo.set(...view.position);
    easeTarget.set(...view.target);
    camera.position.lerp(easeTo, k);
    controls.target.lerp(easeTarget, k);
    controls.minDistance = view.near;
    controls.maxDistance = view.far;
  }

  function draw(now: number) {
    raf = 0;
    if (!world) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    if (playing) {
      progress = Math.min(1, progress + dt / duration);
      if (progress >= 1) {
        playing = false;
        emit();
      }
    }
    if (!REDUCED) time += dt;
    adapt(dt);
    // Reduced motion jumps straight to the story's camera rather than gliding there.
    if (world.pose && !taken)
      apply(world.pose(progress), dt && !REDUCED ? 1 - Math.exp(-dt * 2.5) : 1);
    controls.update(dt);
    camera.near = Math.max(1e-4, camera.position.distanceTo(controls.target) * 0.002);
    camera.far = camera.near * 1e6;
    camera.updateProjectionMatrix();
    world.update(time, dt, progress);
    composer.render();
    canvas.dataset.progress = progress.toFixed(4);
    if (playing) emit();
    const moving = !REDUCED || playing || controls.enabled;
    if (visible && moving) raf = requestAnimationFrame(draw);
    canvas.dataset.idle = raf ? "0" : "1";
  }
  function request() {
    if (!raf && visible && world) {
      canvas.dataset.idle = "0";
      last = 0;
      raf = requestAnimationFrame(draw);
    }
  }

  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    cancelAnimationFrame(raf);
    raf = 0;
    canvas.dataset.lost = "1";
  });

  const engine: Engine = {
    canvas,
    async show(o) {
      const mine = ++build;
      const load = KINDS[o.kind];
      if (!load) throw new Error(`no scene kind "${o.kind}"`);
      const make = (await load()).default;
      if (mine !== build) return world as KindWorld;
      world?.dispose();
      scene = new THREE.Scene();
      pass.scene = scene;
      const small = typeof window !== "undefined" && window.innerWidth < 700;
      world = make({
        three: THREE,
        scene,
        camera,
        renderer,
        params: o.params,
        colour: o.colour,
        data: o.data,
        detail: software ? 0.3 : small ? 0.5 : 1,
        redraw: () => request(),
      });
      canvas.dataset.kind = o.kind;
      duration = o.duration ?? 40;
      progress = o.progress ?? 0;
      playing = !!o.autoplay && !REDUCED;
      taken = false;
      time = 0;
      apply(world.pose ? world.pose(progress) : world.view, 1);
      emit();
      request();
      return world;
    },
    attach(h) {
      if (host) observer.unobserve(host);
      host = h;
      h.prepend(canvas);
      observer.observe(h);
      resize();
      request();
    },
    setInteractive(on) {
      controls.enabled = on;
      if (!on) taken = false;
      request();
    },
    pick(x, y) {
      if (!world?.pick || !width || !height) return undefined;
      pointer.set((x / width) * 2 - 1, -(y / height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      return world.pick(raycaster);
    },
    setVisible(on) {
      visible = on;
      if (on) request();
      else {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
    setProgress(p) {
      progress = Math.min(1, Math.max(0, p));
      taken = false;
      emit();
      request();
    },
    play() {
      if (progress >= 1) progress = 0;
      playing = true;
      taken = false;
      emit();
      request();
    },
    pause() {
      playing = false;
      emit();
      request();
    },
    playing: () => playing,
    beats: () => world?.beats ?? [],
    resetView() {
      taken = false;
      if (world) apply(world.pose ? world.pose(progress) : world.view, 1);
      request();
    },
    snapshot() {
      if (!world) return "";
      composer.render();
      return canvas.toDataURL("image/webp", 0.82);
    },
    on(f) {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    dispose() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      world?.dispose();
      controls.dispose();
      composer.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
  return engine;
}

/** The page's one engine, made the first time a scene asks for it. */
let shared: Engine | undefined;
export function theEngine(): Engine {
  shared ??= createEngine();
  return shared;
}

/** The GPU's name, from a throwaway context, or "" where the browser hides it. */
function gpuName(): string {
  const gl = document.createElement("canvas").getContext("webgl2");
  if (!gl) return "";
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return name;
}
