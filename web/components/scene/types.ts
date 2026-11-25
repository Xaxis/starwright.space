/**
 * The contract between the engine and a scene kind. A kind builds its objects into the scene it is
 * given, says where the camera starts, and moves its objects each frame. It may tell a story: beats
 * at points along a 0 to 1 progress, which the page shows as captions and the reader can scrub.
 */
import type * as THREE from "three";

export type Params = Record<string, number | string | boolean>;

export interface KindContext {
  three: typeof THREE;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  /** The scene's knobs from data/, with every "{id}" already replaced by the model's value. */
  params: Params;
  /** The colour of the record's domain, as #rrggbb. */
  colour: string;
  /** Anything else a kind needs that is too big for params, such as the tower's graph. */
  data?: unknown;
  /** Lower on small or slow screens: fewer instances, simpler shaders. */
  detail: number;
  /** Ask for a frame, when something arrives (a map) while the scene is still. */
  redraw(): void;
}

export interface Beat {
  /** Where along the story this beat sits, 0 to 1. */
  at: number;
  title: string;
  caption: string;
  /** A short reading for the corner of the scene, such as "K 0.80 · 2071". */
  meter?: string;
}

export interface View {
  position: [number, number, number];
  target: [number, number, number];
  /** How near and far the reader may zoom, as distances from the target. */
  near: number;
  far: number;
}

export interface KindWorld {
  view: View;
  /** Called every frame: seconds since the scene began, seconds since the last frame, and the
   * story's progress (0 to 1; kinds without a story may ignore it). */
  update(time: number, dt: number, progress: number): void;
  /** The story, if this kind tells one. */
  beats?: Beat[];
  /** A camera the story wants at this progress; when given, the engine eases toward it unless the
   * reader has taken the camera. */
  pose?(progress: number): View;
  /** What is under the reader's pointer, for kinds whose parts lead somewhere (the tower). */
  pick?(ray: THREE.Raycaster): Picked | undefined;
  dispose(): void;
}

export interface Picked {
  label: string;
  /** A second line, such as the area and the rung. */
  detail?: string;
  href?: string;
}

export type Kind = (ctx: KindContext) => KindWorld;
