/**
 * A solar tracker table: three modules on a torque tube that turns to follow the Sun, on two posts
 * with a slew drive and a controller. Each module is an aluminium frame, a sheet of cells with
 * their silver fingers and busbars, and the glass over them, which catches a glint as the table
 * turns through the Sun's reflection. The fleet is a solar farm, row after row to the horizon.
 */
import { type Kit, type Model, ramp } from "./kit.ts";

const H = 1.75;
const MW = 1.1;
const ML = 2.2;

export default function panel(kit: Kit): Model {
  const { T, m } = kit;
  const root = new T.Group();

  const cellTex = kit.canvas(256, 512, (g) => {
    g.fillStyle = "#d9dde2";
    g.fillRect(0, 0, 256, 512);
    const cw = 256 / 6;
    const ch = 512 / 12;
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 12; j++) {
        const x = i * cw + 1.5;
        const y = j * ch + 1.5;
        const grad = g.createLinearGradient(x, y, x + cw, y + ch);
        grad.addColorStop(0, "#0d1a33");
        grad.addColorStop(1, "#14254a");
        g.fillStyle = grad;
        g.fillRect(x, y, cw - 3, ch - 3);
        g.fillStyle = "rgba(170,185,210,0.35)";
        for (let k = 1; k < 14; k++) g.fillRect(x, y + (k * (ch - 3)) / 14, cw - 3, 0.6);
        g.fillStyle = "rgba(210,215,225,0.85)";
        for (let k = 1; k < 4; k++) g.fillRect(x + (k * (cw - 3)) / 4 - 0.8, y, 1.6, ch - 3);
      }
    }
  });
  const cells = kit.keep(
    new T.MeshPhysicalMaterial({
      map: cellTex,
      roughness: 0.32,
      metalness: 0.35,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
    }),
  );
  const glass = kit.keep(
    new T.MeshPhysicalMaterial({
      color: "#cfe0ff",
      transparent: true,
      opacity: 0.12,
      roughness: 0.02,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      depthWrite: false,
    }),
  );

  // Posts, slew drive and controller stay put; the table turns on the tube.
  for (const z of [-1.25, 1.25]) {
    kit.mesh(kit.box(0.12, H, 0.22), m.alu, root, [0, H / 2, z]);
    kit.mesh(kit.box(0.2, 0.06, 0.3), m.dark, root, [0, 0.03, z]);
  }
  kit.mesh(kit.cyl(0.2, 0.2, 0.26, 28), m.dark, root, [0, H - 0.05, 0], [0, 0, Math.PI / 2]);
  const ctrl = kit.group(root, [0.02, 1.0, 1.25]);
  kit.mesh(kit.box(0.08, 0.3, 0.22, 0.02), m.paint, ctrl, [0.1, 0, 0]);
  kit.mesh(new T.SphereGeometry(0.025, 8, 6), m.accent, ctrl, [0.15, 0.08, 0.06]);
  kit.shadow(1.9, 2.4, root);

  const table = kit.group(root, [0, H + 0.12, 0]);
  kit.live(table);
  const tube = kit.cyl(0.07, 0.07, 3.7, 20);
  tube.rotateX(Math.PI / 2);
  const tubeM = kit.mesh(tube, m.steel, table);
  kit.part(tubeM, [0, -0.9, 0], [0, 0, 0], 0);
  for (let k = 0; k < 3; k++) {
    const z = (k - 1) * (MW + 0.04);
    const mod = kit.group(table, [0, 0.09, z]);
    kit.mesh(kit.box(0.08, 0.05, 0.1), m.dark, table, [0, 0.07, z]);
    const tray = kit.mesh(kit.box(ML, 0.045, MW, 0.012), m.alu, mod);
    const sheet = kit.mesh(
      new T.PlaneGeometry(MW - 0.05, ML - 0.05),
      cells,
      mod,
      [0, 0.024, 0],
      [-Math.PI / 2, 0, Math.PI / 2],
    );
    const pane = kit.mesh(
      new T.PlaneGeometry(ML - 0.03, MW - 0.03),
      glass,
      mod,
      [0, 0.03, 0],
      [-Math.PI / 2, 0, 0],
    );
    pane.userData.noGhost = true;
    kit.part(tray, [0, 0.7, 0], [0, 0, 0.3], 1 + k * 0.5);
    kit.part(sheet, [0, 1.4, 0], [0, 0, -0.3], 1.2 + k * 0.5);
    kit.part(pane, [0, 2.1, 0], [0.2, 0, 0], 1.4 + k * 0.5);
  }

  // The glint: a star where the table's face bisects the Sun and the eye.
  const glint = kit.glow(new T.Color("#fff6e0").multiplyScalar(3), 1.6, table, [0.3, 0.06, 0.4], 0);
  kit.solo(glint);
  const normal = new T.Vector3();
  const half = new T.Vector3();
  const cam = new T.Vector3();
  const at = new T.Vector3();
  const q = new T.Quaternion();

  return {
    root,
    size: 2.45,
    centre: [0, 1.35, 0],
    setting: "ground",
    look: [0.55, 0.38],
    lookFar: 0.24,
    layout: { kind: "grid", spacing: [5.2, 3.65], count: 900, jitter: 0, yaw: "same" },
    update(time, _dt, run, p) {
      // The glint shows when the face's normal lies halfway between the Sun and the camera: the
      // table tracks toward that angle and swings through it as the story moves.
      kit.ctx.camera.getWorldPosition(cam);
      half.copy(cam).sub(glint.getWorldPosition(at)).normalize().add(kit.sun).normalize();
      const aim = Math.max(-1.0, Math.min(1.0, Math.atan2(-half.x, half.y)));
      table.rotation.z = aim + (p - 0.3) * 0.9 + Math.sin(time * 0.3 * kit.speed) * 0.3 * run;
      normal.set(0, 1, 0).applyQuaternion(table.getWorldQuaternion(q));
      const k = Math.max(0, normal.dot(half));
      glint.material.opacity = k ** 40 * ramp(p, 0.12, 0.22);
      glint.scale.setScalar(1.2 + 2.5 * k ** 80);
    },
  };
}
