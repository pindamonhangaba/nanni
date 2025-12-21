import * as THREE from "three";

export type GroundShapeOptions = {
  seed: string | number;

  // Core constraints (EXCLUDING padding + radius)
  minArea?: number; // world units^2
  maxArea?: number; // world units^2

  // If set, overrides min/max area selection
  targetCells?: number;

  // Tuning / safety
  gridW?: number;
  gridH?: number;
  maxAttempts?: number;

  // Look
  straightness?: number; // 0..1 bias to keep growing in same direction

  // Post
  pad?: number; // outward padding in world units (quantized to cells)
  radius?: number; // corner radius in world units
  roundConcave?: boolean; // default false (usually looks better)
  curveSegments?: number; // passed to ShapeGeometry for smooth arcs

  // Placement
  center?: THREE.Vector2;

  // Grid scale (assume generic = 1)
  cellSize?: number; // default 1
};

export type GroundShapeResult = {
  shape: THREE.Shape;
  coreArea: number;
  coreCellCount: number;
  paddedCellCount: number;
  curveSegments: number; // suggested to use in ShapeGeometry
};

function hashToUint(seed: string | number): number {
  const s = String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dirs = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
] as const;

const key = (x: number, y: number) => `${x},${y}`;
const parseKey = (k: string) => {
  const i = k.indexOf(",");
  return { x: Number(k.slice(0, i)), y: Number(k.slice(i + 1)) };
};

function pick<T>(rng: () => number, arr: T[]) {
  return arr[(rng() * arr.length) | 0];
}

/** Connected growth on grid. */
function growPolyomino(
  rng: () => number,
  targetCells: number,
  gridW: number,
  gridH: number,
  straightness: number
): Set<string> {
  const occ = new Set<string>();
  const frontier = new Set<string>();

  const sx = (gridW / 2) | 0;
  const sy = (gridH / 2) | 0;
  occ.add(key(sx, sy));

  const addFrontierAround = (x: number, y: number) => {
    for (const d of dirs) {
      const nx = x + d.dx,
        ny = y + d.dy;
      if (nx < 0 || ny < 0 || nx >= gridW || ny >= gridH) continue;
      const k = key(nx, ny);
      if (!occ.has(k)) frontier.add(k);
    }
  };
  addFrontierAround(sx, sy);

  let lastDir: (typeof dirs)[number] | null = null;

  while (occ.size < targetCells && frontier.size) {
    const cand = Array.from(frontier);

    let chosen: string;
    if (lastDir && straightness > 0 && rng() < straightness) {
      const favored: string[] = [];
      for (const fk of cand) {
        const { x, y } = parseKey(fk);
        const px = x - lastDir.dx;
        const py = y - lastDir.dy;
        if (occ.has(key(px, py))) favored.push(fk);
      }
      chosen = favored.length ? pick(rng, favored) : pick(rng, cand);
    } else {
      chosen = pick(rng, cand);
    }

    frontier.delete(chosen);
    occ.add(chosen);

    const { x, y } = parseKey(chosen);

    // update lastDir from any neighbor (deterministic)
    lastDir = null;
    for (const d of dirs) {
      const nx = x - d.dx,
        ny = y - d.dy;
      if (occ.has(key(nx, ny))) {
        lastDir = d;
        break;
      }
    }

    addFrontierAround(x, y);
  }

  return occ;
}

/** Fast outward padding in grid-cells (square dilation). */
function dilateCells(occ: Set<string>, padCells: number): Set<string> {
  if (padCells <= 0) return new Set(occ);
  const out = new Set<string>();
  for (const c of occ) {
    const { x, y } = parseKey(c);
    for (let dy = -padCells; dy <= padCells; dy++) {
      for (let dx = -padCells; dx <= padCells; dx++) {
        out.add(key(x + dx, y + dy));
      }
    }
  }
  return out;
}

/**
 * Extract the outer boundary edges by canceling shared cell edges,
 * then stitch them into a single loop.
 * Returns closed loop of integer grid-vertex points.
 */
function cellsToBoundaryLoop(occ: Set<string>): Array<{ x: number; y: number }> {
  const ekey = (x1: number, y1: number, x2: number, y2: number) =>
    `${x1},${y1}->${x2},${y2}`;
  const rev = (e: string) => {
    const [a, b] = e.split("->");
    return `${b}->${a}`;
  };

  const edges = new Set<string>();

  for (const c of occ) {
    const { x, y } = parseKey(c);
    const es = [
      ekey(x, y, x + 1, y), // bottom
      ekey(x + 1, y, x + 1, y + 1), // right
      ekey(x + 1, y + 1, x, y + 1), // top
      ekey(x, y + 1, x, y), // left
    ];
    for (const e of es) {
      const r = rev(e);
      if (edges.has(r)) edges.delete(r);
      else edges.add(e);
    }
  }

  const next = new Map<string, string[]>();
  const starts: Array<{ s: string; x: number; y: number }> = [];

  for (const e of edges) {
    const [a, b] = e.split("->");
    if (!next.has(a)) next.set(a, []);
    next.get(a)!.push(b);
    const p = parseKey(a);
    starts.push({ s: a, x: p.x, y: p.y });
  }

  if (!starts.length) return [{ x: 0, y: 0 }, { x: 0, y: 0 }];

  // deterministic start: smallest y then x
  starts.sort((p, q) => (p.y - q.y) || (p.x - q.x));
  const start = starts[0].s;

  const loop: Array<{ x: number; y: number }> = [];
  let cur = start;
  const used = new Set<string>();

  while (true) {
    loop.push(parseKey(cur));
    const outs = next.get(cur);
    if (!outs?.length) break;

    // pick an unused outgoing edge
    let chosen: string | null = null;
    for (const b of outs) {
      const id = `${cur}->${b}`;
      if (!used.has(id)) {
        used.add(id);
        chosen = b;
        break;
      }
    }
    if (!chosen) break;

    cur = chosen;
    if (cur === start) {
      loop.push(parseKey(start));
      break;
    }
    if (loop.length > edges.size + 8) break; // safety
  }

  // simplify collinear points
  const simp: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < loop.length; i++) {
    const a = loop[(i - 1 + loop.length) % loop.length];
    const b = loop[i];
    const c = loop[(i + 1) % loop.length];
    const abx = b.x - a.x, aby = b.y - a.y;
    const bcx = c.x - b.x, bcy = c.y - b.y;
    const col = (abx === 0 && bcx === 0) || (aby === 0 && bcy === 0);
    if (!col || i === 0 || i === loop.length - 1) simp.push(b);
  }

  // ensure closed
  const first = simp[0];
  const last = simp[simp.length - 1];
  if (first && last && (first.x !== last.x || first.y !== last.y)) {
    simp.push({ ...first });
  }
  return simp;
}

/**
 * Build a THREE.Shape with optional filleted corners.
 * roundConcave=false by default (usually nicer for “platform” ground).
 */
function buildRoundedShape(
  ptsClosed: THREE.Vector2[],
  radius: number,
  roundConcave: boolean
): THREE.Shape {
  const shape = new THREE.Shape();

  if (ptsClosed.length < 4 || radius <= 0) {
    shape.moveTo(ptsClosed[0].x, ptsClosed[0].y);
    for (let i = 1; i < ptsClosed.length; i++) shape.lineTo(ptsClosed[i].x, ptsClosed[i].y);
    shape.closePath();
    return shape;
  }

  // drop duplicated last
  const pts = ptsClosed.slice(0, -1);
  const n = pts.length;
  const get = (i: number) => pts[(i + n) % n];

  let started = false;
  let firstTrim: THREE.Vector2 | null = null;

  for (let i = 0; i < n; i++) {
    const prev = get(i - 1);
    const cur = get(i);
    const next = get(i + 1);

    const inVec = new THREE.Vector2(cur.x - prev.x, cur.y - prev.y);
    const outVec = new THREE.Vector2(next.x - cur.x, next.y - cur.y);

    const lenIn = inVec.length();
    const lenOut = outVec.length();
    if (lenIn === 0 || lenOut === 0) continue;

    const dirIn = inVec.clone().multiplyScalar(1 / lenIn);
    const dirOut = outVec.clone().multiplyScalar(1 / lenOut);

    // turn direction via cross (z)
    const cross = dirIn.x * dirOut.y - dirIn.y * dirOut.x; // >0 CCW, <0 CW
    const isConcave = cross > 0; // depending on winding; for our loops this is a good heuristic
    if (isConcave && !roundConcave) {
      if (!started) {
        shape.moveTo(cur.x, cur.y);
        started = true;
        firstTrim = new THREE.Vector2(cur.x, cur.y);
      } else {
        shape.lineTo(cur.x, cur.y);
      }
      continue;
    }

    // clamp radius to avoid overlaps
    const maxR = 0.49 * Math.min(lenIn, lenOut);
    const r = Math.min(radius, maxR);

    const pIn = new THREE.Vector2(cur.x - dirIn.x * r, cur.y - dirIn.y * r);
    const pOut = new THREE.Vector2(cur.x + dirOut.x * r, cur.y + dirOut.y * r);

    // For axis-aligned 90° turns, this gives the correct fillet center.
    const center = new THREE.Vector2(
      cur.x - dirIn.x * r + dirOut.x * r,
      cur.y - dirIn.y * r + dirOut.y * r
    );

    const a0 = Math.atan2(pIn.y - center.y, pIn.x - center.x);
    const a1 = Math.atan2(pOut.y - center.y, pOut.x - center.x);
    const clockwise = cross < 0;

    if (!started) {
      shape.moveTo(pIn.x, pIn.y);
      started = true;
      firstTrim = pIn.clone();
    } else {
      shape.lineTo(pIn.x, pIn.y);
    }
    shape.absarc(center.x, center.y, r, a0, a1, clockwise);
  }

  if (firstTrim) shape.lineTo(firstTrim.x, firstTrim.y);
  shape.closePath();
  return shape;
}

export function createProceduralGroundShape(opts: GroundShapeOptions): GroundShapeResult {
  const {
    seed,
    cellSize = 1,
    minArea,
    maxArea,
    targetCells,
    gridW = 128,
    gridH = 128,
    maxAttempts = 80,
    straightness = 0.4,
    pad = 0,
    radius = 0,
    roundConcave = false,
    curveSegments,
    center = new THREE.Vector2(0, 0),
  } = opts;

  if (cellSize <= 0) throw new Error("cellSize must be > 0");

  const seedBase = hashToUint(seed);
  const cellArea = cellSize * cellSize;

  const minCells = minArea != null ? Math.max(1, Math.ceil(minArea / cellArea)) : 1;
  const maxCells = maxArea != null ? Math.max(minCells, Math.floor(maxArea / cellArea)) : 50000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rng = mulberry32((seedBase + attempt * 1013904223) >>> 0);

    const chosenCells =
      targetCells != null
        ? targetCells
        : minCells + (((rng() * (maxCells - minCells + 1)) | 0) >>> 0);

    const coreOcc = growPolyomino(rng, chosenCells, gridW, gridH, straightness);

    const coreCellCount = coreOcc.size;
    const coreArea = coreCellCount * cellArea;

    if (minArea != null && coreArea < minArea) continue;
    if (maxArea != null && coreArea > maxArea) continue;

    // padding (quantized to cells)
    const padCells = Math.max(0, Math.round(pad / cellSize));
    const paddedOcc = dilateCells(coreOcc, padCells);

    // boundary -> world points
    const loop = cellsToBoundaryLoop(paddedOcc);
    const ptsWorld = loop.map(
      (p) => new THREE.Vector2(p.x * cellSize + center.x, p.y * cellSize + center.y)
    );

    const shape = buildRoundedShape(ptsWorld, radius, roundConcave);

    // “smooth as cheaply possible”: pick a reasonable default for curveSegments
    // Bigger radius => more segments; capped to keep it cheap.
    const suggestedCurveSegments =
      curveSegments ??
      Math.min(64, Math.max(12, Math.round((radius / Math.max(0.25, cellSize)) * 12)));

    return {
      shape,
      coreArea,
      coreCellCount,
      paddedCellCount: paddedOcc.size,
      curveSegments: suggestedCurveSegments,
    };
  }

  throw new Error(
    "Failed to generate shape within constraints. Try increasing gridW/gridH/maxAttempts or relaxing min/max area."
  );
}
