/**
 * A processor on its board: a green board fanned with copper traces, vias and an edge connector;
 * the package on a grid of solder balls; a silicon interposer carrying the compute die and four
 * stacks of memory. Light runs out along the traces and the die's cores flicker as it computes.
 * The fleet is the board tiled to the horizon, a hall of compute seen from above.
 */
import { glowMap, strokePath } from "./glowmap.ts";
import type { Kit, Model } from "./kit.ts";

const PX = 512;
const BOARD = 6;

/** The traces fanning out from the package to the board's edges, in canvas pixels. */
function routes(kit: Kit): [number, number][][] {
  const r = kit.rand;
  const out: [number, number][][] = [];
  const c = PX / 2;
  const half = PX / 4;
  const per = Math.max(10, Math.round(22 * (0.5 + 0.5 * kit.detail)));
  for (let side = 0; side < 4; side++) {
    for (let k = 0; k < per; k++) {
      const t = (k + 0.5) / per;
      const s = c - half + 14 + t * (2 * half - 28);
      const shift = (s - c) * 0.62;
      const stop = r() < 0.35 ? 20 + r() * 70 : PX;
      const pts: [number, number][] = [
        [s, c - half],
        [s, c - half - 12],
        [s + shift, c - half - 12 - Math.abs(shift)],
        [s + shift, Math.max(10, c - half - 12 - Math.abs(shift) - stop)],
      ];
      // Rotate the side into place about the board's centre.
      out.push(
        pts.map(([x, y]) => {
          const dx = x - c;
          const dy = y - c;
          if (side === 0) return [x, y];
          if (side === 1) return [c - dy, c + dx];
          if (side === 2) return [c - dx, c - dy];
          return [c + dy, c - dx];
        }),
      );
    }
  }
  return out;
}

export default function chip(kit: Kit): Model {
  const { T, m } = kit;
  const root = new T.Group();
  const paths = routes(kit);
  const seeds = paths.map(() => kit.rand());

  // The board: solder mask over copper, gold vias, silkscreen, and its glow paths.
  const boardTex = kit.canvas(PX, PX, (g) => {
    g.fillStyle = "#0a2619";
    g.fillRect(0, 0, PX, PX);
    for (const p of paths) {
      g.strokeStyle = "#1a5a3a";
      g.lineWidth = 4;
      g.lineJoin = "round";
      g.beginPath();
      for (const [i, [x, y]] of p.entries()) {
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.stroke();
      const [ex, ey] = p[p.length - 1] as [number, number];
      if (ex > 12 && ex < PX - 12 && ey > 12 && ey < PX - 12) {
        g.fillStyle = "#c9a24a";
        g.beginPath();
        g.arc(ex, ey, 4, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#06150e";
        g.beginPath();
        g.arc(ex, ey, 1.6, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.strokeStyle = "rgba(220,230,225,0.55)";
    g.lineWidth = 1.5;
    g.strokeRect(PX / 4 - 8, PX / 4 - 8, PX / 2 + 16, PX / 2 + 16);
    for (let i = 0; i < 6; i++) g.strokeRect(30 + i * 22, PX - 70, 16, 10);
    g.fillStyle = "#d2a948";
    for (let i = 0; i < 40; i++) g.fillRect(70 + i * 9.4, PX - 18, 6, 18);
  });
  const glowTex = kit.canvas(
    PX,
    PX,
    (g) => {
      g.fillStyle = "#000";
      g.fillRect(0, 0, PX, PX);
      paths.forEach((p, i) => {
        strokePath(g, p, 2.2, 420, seeds[i] as number);
      });
    },
    false,
  );
  const boardMat = kit.std({ map: boardTex, roughness: 0.42, metalness: 0.1 });
  const edgeMat = kit.std({ color: "#0b1f16", roughness: 0.6 });
  kit.mesh(kit.box(BOARD, 0.12, BOARD), edgeMat, root, [0, 0.06, 0]);
  const plane = new T.PlaneGeometry(BOARD, BOARD);
  kit.mesh(plane, boardMat, root, [0, 0.121, 0], [-Math.PI / 2, 0, 0]);
  const traces = glowMap(kit, glowTex, "run", 3, 1);
  const traceMesh = kit.mesh(plane, traces.material, root, [0, 0.123, 0], [-Math.PI / 2, 0, 0]);
  traceMesh.renderOrder = 2;
  kit.shadow(BOARD * 0.62, BOARD * 0.62, root, [0, 0.004, 0], 0.8);

  // Parts on the board: power stages, inductors, the edge connector's fingers.
  const ind = kit.box(0.42, 0.34, 0.42, 0.05);
  const indMat = kit.std({ color: "#3a3d44", roughness: 0.55, metalness: 0.4 });
  for (let i = 0; i < 6; i++) {
    const x = -2.1 + i * 0.5;
    const g = kit.mesh(ind, indMat, root, [x, 0.29, -2.35]);
    kit.part(g, [0, 1.4 + i * 0.1, -0.8], [0, 0.6, 0], 20 + i);
  }
  const capGeo = kit.box(0.16, 0.12, 0.09);
  const caps = new T.InstancedMesh(capGeo, kit.std({ color: "#8c7a5c", roughness: 0.5 }), 24);
  const mm = new T.Matrix4();
  for (let i = 0; i < 24; i++) {
    const side = i % 4;
    const k = Math.floor(i / 4);
    const a = -0.9 + k * 0.36;
    const d = 1.72;
    const [x, z] = side === 0 ? [a, d] : side === 1 ? [d, a] : side === 2 ? [-a, -d] : [-d, -a];
    mm.makeRotationY(side % 2 ? Math.PI / 2 : 0).setPosition(x, 0.42, z);
    caps.setMatrixAt(i, mm);
  }
  root.add(caps);
  for (let i = 0; i < 24; i++) kit.partAt(caps, i, [0, 1.6, 0], [0, 1.2, 0], 12 + i * 0.1);

  // The package: solder balls, then the substrate.
  const balls = Math.round(12 * (0.6 + 0.4 * kit.detail));
  const ballMesh = new T.InstancedMesh(
    kit.keep(new T.SphereGeometry(0.075, 8, 6)),
    kit.std({ color: "#c8ccd0", metalness: 1, roughness: 0.3 }),
    balls * balls,
  );
  for (let i = 0; i < balls; i++) {
    for (let j = 0; j < balls; j++) {
      mm.makeTranslation(
        -1.35 + (2.7 * (i + 0.5)) / balls,
        0.19,
        -1.35 + (2.7 * (j + 0.5)) / balls,
      );
      ballMesh.setMatrixAt(i * balls + j, mm);
    }
  }
  root.add(ballMesh);
  for (let i = 0; i < balls * balls; i++)
    kit.partAt(ballMesh, i, [0, 0.6, 0], [0, 0, 0], 1 + i / (balls * balls));
  const sub = kit.group(root);
  kit.mesh(
    kit.box(3, 0.14, 3, 0.02),
    kit.std({ color: "#2d3a2a", roughness: 0.55 }),
    sub,
    [0, 0.33, 0],
  );
  kit.mesh(kit.box(3.02, 0.02, 3.02), m.gold, sub, [0, 0.27, 0]);
  kit.part(sub, [0, 1.2, 0], [0, 0.5, 0], 3);

  // The interposer, the die and the memory stacks.
  const inter = kit.group(root);
  // Silicon, with the copper pads where the die and the memory land and the wiring between them.
  const interTex = kit.canvas(256, 192, (g) => {
    g.fillStyle = "#2a2f39";
    g.fillRect(0, 0, 256, 192);
    const pads = (x: number, y: number, w: number, h: number, step: number) => {
      g.fillStyle = "#3a4150";
      g.fillRect(x - 2, y - 2, w + 4, h + 4);
      g.fillStyle = "#b9773f";
      for (let i = x + step / 2; i < x + w; i += step)
        for (let j = y + step / 2; j < y + h; j += step) g.fillRect(i - 1, j - 1, 2, 2);
    };
    pads(96, 64, 64, 64, 6);
    for (const [x, z] of [
      [-0.98, -0.42],
      [-0.98, 0.42],
      [0.98, -0.42],
      [0.98, 0.42],
    ] as [number, number][]) {
      const cx = 128 + (x / 2.6) * 256;
      const cy = 96 + (z / 1.9) * 192;
      pads(cx - 20, cy - 30, 40, 60, 5);
    }
    g.strokeStyle = "rgba(185,119,63,0.55)";
    g.lineWidth = 1;
    for (let k = 0; k < 9; k++) {
      const y = 70 + k * 6.5;
      g.beginPath();
      g.moveTo(60, y);
      g.lineTo(96, y);
      g.moveTo(160, y);
      g.lineTo(196, y);
      g.stroke();
    }
  });
  kit.mesh(
    kit.box(2.6, 0.05, 1.9, 0.01),
    kit.std({ map: interTex, metalness: 0.55, roughness: 0.35 }),
    inter,
    [0, 0.425, 0],
  );
  kit.part(inter, [0, 1.6, 0], [0, -0.4, 0], 4);
  const dieTex = kit.canvas(256, 256, (g) => {
    g.fillStyle = "#14171e";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const x = 14 + i * 58;
        const y = 14 + j * 58;
        g.fillStyle = (i + j) % 2 ? "#232a36" : "#1f2530";
        g.fillRect(x, y, 52, 52);
        g.fillStyle = "#2f3848";
        for (let k = 0; k < 13; k++) g.fillRect(x + 3, y + 4 + k * 4, 46, 1.5);
      }
    }
    g.fillStyle = "#545c6c";
    for (let k = 0; k < 40; k++) {
      g.fillRect(4 + k * 6.2, 3, 3, 4);
      g.fillRect(4 + k * 6.2, 249, 3, 4);
    }
  });
  const dieGlow = kit.canvas(
    256,
    256,
    (g) => {
      g.fillStyle = "#000";
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          const seed = kit.rand();
          for (let k = 0; k < 13; k++) {
            g.fillStyle = `rgb(255,${Math.round(((i * 58 + 14) / 256) * 255)},${Math.round(seed * 255)})`;
            g.fillRect(14 + i * 58 + 3, 14 + j * 58 + 4 + k * 4, 46, 1.5);
          }
        }
      }
    },
    false,
  );
  const die = kit.group(root);
  const dieMat = kit.std({ map: dieTex, roughness: 0.18, metalness: 0.65 });
  kit.mesh(kit.box(1.3, 0.12, 1.3, 0.01), dieMat, die, [0, 0.51, 0]);
  const cores = glowMap(kit, dieGlow, "flicker", 1, 1.1);
  const corePlane = new T.PlaneGeometry(1.28, 1.28);
  kit.mesh(corePlane, cores.material, die, [0, 0.571, 0], [-Math.PI / 2, 0, 0]).renderOrder = 2;
  kit.part(die, [0, 2.8, 0], [0, 0.9, 0], 5);
  const hbmGeo = kit.box(0.42, 0.04, 0.62, 0.005);
  const layers = 4;
  const hbm = new T.InstancedMesh(
    hbmGeo,
    kit.std({ color: "#20242b", metalness: 0.7, roughness: 0.3 }),
    4 * layers,
  );
  const stackAt: [number, number][] = [
    [-0.98, -0.42],
    [-0.98, 0.42],
    [0.98, -0.42],
    [0.98, 0.42],
  ];
  stackAt.forEach(([x, z], s) => {
    for (let l = 0; l < layers; l++) {
      mm.makeTranslation(x, 0.47 + l * 0.04, z);
      hbm.setMatrixAt(s * layers + l, mm);
    }
  });
  root.add(hbm);
  stackAt.forEach(([x], s) => {
    for (let l = 0; l < layers; l++)
      kit.partAt(
        hbm,
        s * layers + l,
        [Math.sign(x) * 0.9, 2.2 + l * 0.35, 0],
        [0, 0.3 * (l - 1.5), 0],
        6 + s + l * 0.2,
      );
  });

  return {
    root,
    size: 4.4,
    centre: [0, 0.4, 0],
    setting: "floor",
    look: [0.75, 0.62],
    lookFar: 0.42,
    layout: { kind: "grid", spacing: [6.5, 6.5], count: 720, jitter: 0, yaw: "same" },
    update(time, _dt, run, p) {
      const t = time * kit.speed * 1.4 + p * 4;
      traces.uniforms.uTime.value = t;
      traces.uniforms.uOn.value = (0.15 + 0.85 * run) * kit.fade;
      cores.uniforms.uTime.value = t;
      cores.uniforms.uOn.value = (0.1 + 0.9 * run) * kit.fade;
    },
  };
}
