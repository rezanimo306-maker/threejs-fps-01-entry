// map.js — "Foundry Yard": an original dusk industrial yard, built from data only.
// Lanes run north-south: A lane (west), mid, B lane (east). Two spike sites in the north.
// Walls and crates are axis-aligned boxes {x1,z1,x2,z2,h}. Waypoints form the bot nav graph;
// every edge was placed so its straight line clears all boxes.
export const MAP = {
  name: 'Foundry Yard',
  bounds: { x1: -32, z1: -22, x2: 32, z2: 22 },
  palette: {
    sky: 0x39415e, fog: 0x39415e, ground: 0x4a5160, groundLine: 0x3a4150,
    wall: 0x6e7889, wallTop: 0x878fa0, accent: 0x8a5a2e, rust: 0x7a4a26,
    crate: 0x6e5a33, crateDark: 0x54432a, siteA: 0xffb347, siteB: 0x7fd4ff,
    ember: 0xff8c2e, warden: 0x37b6c9, sun: 0xffb347, hemi: 0x8a97b8,
  },
  sites: {
    A: { name: 'REACTOR', x: -24.5, z: -14.5, r: 4.6 },
    B: { name: 'CRANE DOCK', x: 24.5, z: -14.5, r: 4.6 },
  },
  spawns: {
    ember: [ // attackers, south, facing north (-z)
      { x: -10, z: 18.5 }, { x: -5, z: 19 }, { x: 0, z: 18.5 }, { x: 5, z: 19 }, { x: 10, z: 18.5 },
    ],
    warden: [ // defenders, north, facing south (+z)
      { x: -10, z: -18.5 }, { x: -5, z: -19 }, { x: 0, z: -18.5 }, { x: 5, z: -19 }, { x: 10, z: -18.5 },
    ],
  },
  walls: [
    // perimeter (h 4)
    { x1: -32, z1: -22, x2: 32, z2: -20, h: 4 },
    { x1: -32, z1: 20, x2: 32, z2: 22, h: 4 },
    { x1: -32, z1: -22, x2: -30, z2: 22, h: 4 },
    { x1: 30, z1: -22, x2: 32, z2: 22, h: 4 },
    // lane separators and cover blocks
    { x1: -12, z1: -2, x2: -10, z2: 10, h: 3.2 },
    { x1: 10, z1: -10, x2: 12, z2: 2, h: 3.2 },
    { x1: 2, z1: -12, x2: 10, z2: -8, h: 3.2 },
    { x1: -28, z1: -4, x2: -24, z2: -2, h: 3.0 },
    { x1: 20, z1: -8, x2: 28, z2: -6, h: 3.0 },
    { x1: -30, z1: 8, x2: -22, z2: 10, h: 2.6 },
    { x1: 22, z1: 8, x2: 30, z2: 10, h: 2.6 },
    // site enclosures (gaps are the entrances)
    { x1: -16, z1: -20, x2: -14, z2: -15, h: 3.2 },
    { x1: -16, z1: -13, x2: -14, z2: -8, h: 3.2 },
    { x1: 14, z1: -20, x2: 16, z2: -15, h: 3.2 },
    { x1: 14, z1: -13, x2: 16, z2: -8, h: 3.2 },
  ],
  crates: [
    { x1: -28, z1: -18, x2: -25, z2: -15, h: 1.4 },   // reactor core, site A
    { x1: 22, z1: -18, x2: 25, z2: -15, h: 1.4 },    // crane base, site B
    { x1: 10, z1: 2, x2: 13, z2: 5, h: 1.2 },         // mid-east crates
    { x1: -26, z1: 6, x2: -23, z2: 9, h: 1.1 },
    { x1: 23, z1: 2, x2: 26, z2: 5, h: 1.1 },
    { x1: -16, z1: -11, x2: -13, z2: -8, h: 1.2 },
    { x1: 13, z1: -10, x2: 16, z2: -7, h: 1.2 },
    { x1: -28, z1: -12, x2: -26.4, z2: -10.4, h: 1.0 }, // barrels A
    { x1: 26.4, z1: -12, x2: 28, z2: -10.4, h: 1.0 },   // barrels B
  ],
  // Nav graph: node index -> {x, z}; edges are index pairs.
  waypoints: [
    { x: 0, z: 18 },     // 0 attacker spawn
    { x: -8, z: 14 },    // 1 A-side south
    { x: 8, z: 14 },     // 2 B-side south
    { x: -20, z: 12 },   // 3 A lane south
    { x: 19, z: 12 },    // 4 B lane south
    { x: 0, z: 6 },      // 5 mid south
    { x: -20, z: 0 },    // 6 A lane mid
    { x: 19, z: -2 },    // 7 B lane mid
    { x: -9, z: -3 },    // 8 mid north
    { x: -25, z: -8 },   // 9 A approach
    { x: 18, z: -10 },   // 10 B approach
    { x: -26, z: -14 },  // 11 site A
    { x: 26, z: -14 },   // 12 site B
    { x: 0, z: -14 },    // 13 defender mid hold
    { x: -12, z: -14 },  // 14 defender A hold
    { x: 12, z: -14 },   // 15 defender B hold
    { x: -8, z: -5 },    // 16 mid west pocket
    { x: 8, z: -4 },     // 17 mid east pocket
    { x: -20, z: 16 },   // 18 attacker west
    { x: 20, z: 16 },    // 19 attacker east
  ],
  edges: [
    [0, 1], [0, 2], [0, 5], [0, 18], [0, 19],
    [1, 3], [1, 5], [1, 18], [2, 4], [2, 5], [2, 19],
    [3, 6], [3, 18], [4, 7], [4, 19],
    [5, 8], [5, 16], [5, 17],
    [6, 9], [6, 16],
    [7, 10],
    [8, 13], [8, 16], [8, 17],
    [9, 11], [9, 16],
    [10, 12],
    [11, 14], [12, 13], [12, 15],
    [13, 14], [13, 15],
  ],
};

// All solid boxes (walls + crates) for collision and ray tests.
export const SOLIDS = [...MAP.walls, ...MAP.crates];

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

// Circle (x,z,r) vs one box: push the circle out, return corrected x/z.
export function collideCircle(x, z, r) {
  for (let i = 0; i < SOLIDS.length; i++) {
    const b = SOLIDS[i];
    const cx = clamp(x, b.x1, b.x2), cz = clamp(z, b.z1, b.z2);
    let dx = x - cx, dz = z - cz;
    let d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2), push = (r - d) / d;
      x += dx * push; z += dz * push;
    } else {
      // Centre inside the box: push out along the smallest penetration axis.
      const pl = x - b.x1 + r, pr = b.x2 - x + r, pt = z - b.z1 + r, pb = b.z2 - z + r;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) x = b.x1 - r; else if (m === pr) x = b.x2 + r;
      else if (m === pt) z = b.z1 - r; else z = b.z2 + r;
    }
  }
  const bb = MAP.bounds;
  x = clamp(x, bb.x1 + r, bb.x2 - r);
  z = clamp(z, bb.z1 + r, bb.z2 - r);
  return [x, z];
}

// Ray (origin + t*dir) vs all solid boxes. Returns {dist} of nearest hit, or null.
export function raySolids(ox, oy, oz, dx, dy, dz, maxDist) {
  let best = maxDist;
  for (let i = 0; i < SOLIDS.length; i++) {
    const b = SOLIDS[i];
    const t = rayBox(ox, oy, oz, dx, dy, dz, b.x1, 0, b.z1, b.x2, b.h, b.z2);
    if (t !== null && t < best) best = t;
  }
  return best < maxDist ? { dist: best } : null;
}

// Slab test for a ray against an AABB. Returns entry t, or null.
export function rayBox(ox, oy, oz, dx, dy, dz, x1, y1, z1, x2, y2, z2) {
  let tmin = 0, tmax = 1e9;
  const o = [ox, oy, oz], d = [dx, dy, dz], mn = [x1, y1, z1], mx = [x2, y2, z2];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < mn[a] || o[a] > mx[a]) return null;
    } else {
      let t1 = (mn[a] - o[a]) / d[a], t2 = (mx[a] - o[a]) / d[a];
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

// Does segment (ax,ay,az)-(bx,by,bz) cross any solid box? (line-of-sight test)
export function segmentBlocked(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-6) return false;
  const hit = raySolids(ax, ay, az, dx / len, dy / len, dz / len, len - 0.01);
  return hit !== null;
}

export function siteAt(x, z) {
  for (const key of ['A', 'B']) {
    const s = MAP.sites[key];
    const dx = x - s.x, dz = z - s.z;
    if (dx * dx + dz * dz <= s.r * s.r) return key;
  }
  return null;
}

// Breadth-first shortest path over the waypoint graph. Returns node indices.
const ADJ = MAP.waypoints.map(() => []);
for (const [a, b] of MAP.edges) { ADJ[a].push(b); ADJ[b].push(a); }

export function nearestWaypoint(x, z) {
  let bi = 0, bd = 1e9;
  for (let i = 0; i < MAP.waypoints.length; i++) {
    const w = MAP.waypoints[i];
    const d = (w.x - x) * (w.x - x) + (w.z - z) * (w.z - z);
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

export function findPath(fromX, fromZ, toX, toZ) {
  const start = nearestWaypoint(fromX, fromZ);
  const goal = nearestWaypoint(toX, toZ);
  if (start === goal) return [goal];
  const prev = new Array(MAP.waypoints.length).fill(-1);
  const q = [start];
  prev[start] = start;
  for (let qi = 0; qi < q.length; qi++) {
    const n = q[qi];
    if (n === goal) break;
    for (const m of ADJ[n]) {
      if (prev[m] === -1) { prev[m] = n; q.push(m); }
    }
  }
  if (prev[goal] === -1) return [goal];
  const path = [];
  let n = goal;
  while (n !== start) { path.push(n); n = prev[n]; }
  path.push(start);
  path.reverse();
  return path;
}
