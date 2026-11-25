/**
 * Getting mass off a world. The story opens on the first launch from one site and pulls back as the
 * system grows to its full cadence:
 *
 * - method: rocket (pads and gravity-turn trails into orbit), mass-driver (a coil track throwing
 *   slugs to space), tether (spinning tethers catching payloads from a hop and flinging them up),
 *   elevator (a ribbon to past the stationary orbit, climbers riding it), loop (a launch loop: an
 *   iron belt racing round an elevated track, vehicles riding it to orbit) or sail (a station
 *   beaming light at sails, pushing them out toward another world);
 * - world: earth, moon, mercury or asteroid (a lumpy rock, its comet target far out for rockets);
 * - cadence: how often they launch: more pads, packets, climbers, tethers or sails, faster.
 *
 * Units are the world's radius. Structures are drawn far larger than life so they read.
 */

import { makeEarth, makeSun } from "../lib/bodies.ts";
import { Bag, materials, shapes } from "../lib/space/craft.ts";
import {
  addSunlight,
  choice,
  farAway,
  ll,
  makeBackdrop,
  pixelScale,
  share,
  shotPath,
  storyBeats,
} from "../lib/space/kit.ts";
import { LAUNCHERS, type LaunchEnv, type Method, type WorldName } from "../lib/space/launchers.ts";
import { makeWorld, type World } from "../lib/space/rock.ts";
import type { Kind } from "../types.ts";

const METHODS: readonly Method[] = ["rocket", "mass-driver", "tether", "elevator", "loop", "sail"];
const WORLDS: readonly WorldName[] = ["earth", "moon", "mercury", "asteroid"];

/** Where each method launches from, on each world: longitude, latitude. */
function siteFor(method: Method, world: WorldName): [number, number] {
  if (world === "earth") {
    if (method === "rocket") return [-80.6, 28.5];
    if (method === "mass-driver") return [-69, -23];
    if (method === "elevator") return [-82, 0];
    if (method === "loop") return [-100, 3];
    if (method === "tether") return [-35, 4];
    return [15, 12];
  }
  if (world === "moon") return method === "elevator" ? [0, 0] : [25, 8];
  if (world === "mercury") return [72, 10];
  return [20, 15];
}

const launch: Kind = (ctx) => {
  const T = ctx.three;
  const { scene, camera } = ctx;
  const method = choice(ctx, "method", METHODS, "rocket");
  const world = choice(ctx, "world", WORLDS, method === "mass-driver" ? "moon" : "earth");
  const cadence = share(ctx, "cadence", 0.5);
  const bag = new Bag();
  const [lon, lat] = siteFor(method, world);

  // The world's frame: Earth turns slowly about its tilted axis; the others hold still.
  const TILT = world === "earth" ? (23.44 * Math.PI) / 180 : 0;
  const tilt = new T.Group();
  tilt.rotation.z = TILT;
  const root = new T.Group();
  tilt.add(root);
  scene.add(tilt);
  const n = ll(T, lon, lat);
  const e = new T.Vector3(0, 1, 0).cross(n).normalize();
  const north = n.clone().cross(e).normalize();

  // The Sun: low over the site, at dusk on Earth so the trails catch light over a darkening ground.
  const siteWorld = n.clone().applyAxisAngle(new T.Vector3(0, 0, 1), TILT);
  const flat = new T.Vector3(siteWorld.x, 0, siteWorld.z).normalize();
  // Rockets fly at sunset, the city lights coming on; the rest work in late afternoon light so the
  // ground under them reads.
  const sunAngle =
    world === "earth" ? (method === "rocket" ? 90 : 70) : world === "asteroid" ? 55 : 72;
  const sunDir = flat
    .applyAxisAngle(new T.Vector3(0, 1, 0), (sunAngle * Math.PI) / 180)
    .add(new T.Vector3(0, siteWorld.y * Math.cos((sunAngle * Math.PI) / 180), 0))
    .normalize();
  const sunFar = sunDir.clone().multiplyScalar(world === "mercury" ? 23730 : 1e5);
  const sky = makeBackdrop(ctx);
  addSunlight(ctx, sunDir, 3.4, 0.12);

  let earth: ReturnType<typeof makeEarth> | undefined;
  let rock: World | undefined;
  const extras: (() => void)[] = [];
  const disposers: (() => void)[] = [];
  if (world === "earth") {
    earth = makeEarth(ctx, { sun: sunFar });
    scene.add(earth.group);
  } else {
    const flatSite = new T.Vector4(n.x, n.y, n.z, 0.35);
    rock = makeWorld(ctx, {
      map: world === "moon" ? "moon.jpg" : world === "mercury" ? "mercury.jpg" : undefined,
      radius: 1,
      sun: sunFar,
      gain: world === "moon" ? 0.95 : 1.05,
      tint: "#7a7068",
      lumpy: world === "asteroid" ? 0.4 : 0,
      flat: world === "asteroid" ? flatSite : undefined,
    });
    root.add(rock.mesh);
    if (world === "mercury") {
      const sun = makeSun(ctx, 285);
      scene.add(sun.group);
      const place = farAway(ctx, sun.group, sunDir, 23730);
      extras.push(() => {
        place();
        sun.update(0, camera);
      });
      disposers.push(sun.dispose);
    }
    if (world === "moon") {
      const home = makeEarth(ctx, { sun: sunFar });
      scene.add(home.group);
      const place = farAway(ctx, home.group, new T.Vector3(1, 0.05, 0), 221, 3.67);
      extras.push(() => {
        place();
        home.update(0, camera);
      });
      disposers.push(home.dispose);
    }
  }

  const s = shapes(ctx, bag);
  const m = materials(ctx, bag);
  m.setHeat(0.3);
  const env: LaunchEnv = { ctx, s, m, bag, root, n, e, north, cadence, world, sun: sunDir.clone() };
  const rig = LAUNCHERS[method](env);

  // The camera rides with the turning world.
  const rootQ = new T.Quaternion();
  const pose = shotPath(T, rig.shots, (pos, target) => {
    pos.applyQuaternion(rootQ);
    target.applyQuaternion(rootQ);
  });
  const size = new T.Vector2();
  return {
    view: pose(0),
    beats: storyBeats(ctx),
    pose,
    update(time, _dt, p) {
      if (earth) {
        const et = time * 0.2;
        earth.update(et, camera);
        root.rotation.y = et * 0.05;
      }
      tilt.updateMatrixWorld(true);
      root.getWorldQuaternion(rootQ);
      rock?.update(time, camera);
      if (rock) rock.uniforms.uBump.value = Math.max(0, 1 - camera.position.length() / 2.6);
      for (const f of extras) f();
      rig.update(time, p, pixelScale(ctx, size));
    },
    dispose() {
      sky.dispose();
      earth?.dispose();
      rock?.dispose();
      for (const d of disposers) d();
      rig.dispose();
      bag.dispose();
    },
  };
};

export default launch;
