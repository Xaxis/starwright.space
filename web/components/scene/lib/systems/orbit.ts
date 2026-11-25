/**
 * Low Earth orbit as a backdrop: the stars, the Sun low on one side, and Earth filling the view
 * below, its horizon about twenty degrees down as it is from a few hundred kilometres up. Earth
 * rides with the camera (like a sky), so a station tens of metres across and a planet thousands
 * of kilometres across share one frame without fighting over the depth buffer. Sunlight, a blue
 * earthshine from below and an environment map of the same sky light whatever is in orbit.
 */
import type * as THREE from "three";
import type { KindContext } from "../../types.ts";
import { makeEarth, makeSky } from "../bodies.ts";
import { FRAG_HEAD, FRAG_TAIL, VERT_HEAD, VERT_TAIL } from "../glsl.ts";

export interface OrbitBackdrop {
  sunDir: THREE.Vector3;
  update(time: number, camera: THREE.PerspectiveCamera): void;
  dispose(): void;
}

export function makeOrbitBackdrop(ctx: KindContext, sunDir: THREE.Vector3): OrbitBackdrop {
  const T = ctx.three;
  const { scene } = ctx;
  const sky = makeSky(ctx, 1);
  scene.add(sky.mesh);
  const earth = makeEarth(ctx, { sun: sunDir.clone().multiplyScalar(1e12) });
  scene.add(earth.group);
  const sun = new T.DirectionalLight("#fff1dc", 2.4);
  sun.position.copy(sunDir).multiplyScalar(100);
  scene.add(sun);
  const shine = new T.HemisphereLight("#0a0c14", "#3a6aa8", 0.9);
  scene.add(shine);

  // The environment: black above, Earth's blue below, the Sun's glare.
  const envGeo = new T.SphereGeometry(50, 32, 16);
  const envMat = new T.ShaderMaterial({
    vertexShader: `${VERT_HEAD}\nvarying vec3 vD;\nvoid main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); ${VERT_TAIL} }`,
    fragmentShader: /* glsl */ `
      ${FRAG_HEAD}
      uniform vec3 uSun;
      varying vec3 vD;
      void main() {
        vec3 d = normalize(vD);
        vec3 c = mix(vec3(0.0), vec3(0.08, 0.16, 0.3), smoothstep(0.05, -0.4, d.y));
        c += vec3(0.25, 0.45, 0.8) * exp(-pow(d.y + 0.33, 2.0) * 60.0) * 0.6;
        c += vec3(1.0, 0.92, 0.8) * pow(max(dot(d, uSun), 0.0), 200.0) * 5.0;
        gl_FragColor = vec4(c, 1.0);
        ${FRAG_TAIL}
      }`,
    uniforms: { uSun: { value: sunDir } },
    side: T.BackSide,
  });
  let env: THREE.WebGLRenderTarget | undefined;
  try {
    const envScene = new T.Scene();
    envScene.add(new T.Mesh(envGeo, envMat));
    const pmrem = new T.PMREMGenerator(ctx.renderer);
    env = pmrem.fromScene(envScene, 0.02, 0.1, 200);
    pmrem.dispose();
    scene.environment = env.texture;
    scene.environmentIntensity = 0.55;
  } catch {
    env = undefined;
  }
  const down = new T.Vector3(0, -1, 0);
  return {
    sunDir,
    update(time, camera) {
      const d = camera.near * 1e5;
      earth.group.position.copy(camera.position).addScaledVector(down, d);
      earth.group.scale.setScalar(d * 0.94);
      earth.update(time * 0.3, camera);
      earth.uniforms.uSun.value.copy(sunDir).multiplyScalar(1e12);
    },
    dispose() {
      sky.dispose();
      earth.dispose();
      envGeo.dispose();
      envMat.dispose();
      env?.dispose();
      scene.environment = null;
    },
  };
}
