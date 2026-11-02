/**
 * Obstacle-aware right-angle routing for canvas edges.
 *
 * Edges must not run behind or through shapes. This module routes the edge
 * as a sequence of axis-aligned segments around inflated node rectangles
 * using a Hanan grid (axes at the endpoint stubs, every obstacle boundary,
 * and an outer perimeter) searched with A* where turning costs extra, so
 * routes stay straight whenever the geometry allows.
 *
 * The route itself runs between two *stub* points: each anchored endpoint
 * (a node handle) first steps straight out of its node along the handle's
 * outward normal. The endpoint-to-stub segments are the only parts of the
 * path allowed to cross the source/target node rectangles; everything
 * between the stubs treats every node — source and target included — as an
 * inflated obstacle.
 *
 * The function is pure and deterministic (fixed axis sets, fixed neighbor
 * order, stable heap ties), so the same geometry always yields the same
 * path. It returns `null` when no collision-free route exists (e.g. nodes
 * overlap); the caller then falls back to the plain smooth-step path.
 */

export interface RoutePoint {
  x: number;
  y: number;
}

/** Axis-aligned box in flow coordinates. */
export interface ObstacleBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RoutedEdge {
  /** Sharp `M x y L x y …` SVG path in flow coordinates. */
  path: string;
  /** The point at half the total path length (label placement). */
  labelPoint: RoutePoint;
}

/**
 * An outward unit vector. Side handles are axis-aligned; corner handles are
 * normalized diagonals. `null` means that end is free and gets no stub.
 */
type Normal = [number, number] | null;

export interface RouteRequest {
  source: RoutePoint;
  target: RoutePoint;
  sourceNormal: Normal;
  targetNormal: Normal;
  /** Every node rectangle before routing clearance is applied. */
  obstacles: ObstacleBox[];
  /** The anchored endpoint's own raw node box, if that end is attached. */
  sourceObstacle?: ObstacleBox | null;
  /** The anchored endpoint's own raw node box, if that end is attached. */
  targetObstacle?: ObstacleBox | null;
}

/** Clearance the route keeps from every shape (flow px). */
export const ROUTE_CLEARANCE = 16;
/** Preferred stub length beyond the active clearance (flow px). */
const STUB_OFFSET = 8;
/** Minimum stub length; shorter stubs hug the node too tightly. */
const MINIMUM_STUB = 8;
/** Farthest a stub is searched for a clear point (flow px). */
const MAXIMUM_STUB = 240;
/** How far past the content the route is allowed to detour (flow px). */
const PERIMETER_MARGIN = 64;
/** Maximum Hanan-grid points searched synchronously during one render. */
const MAX_ROUTING_GRID_POINTS = 1600;

/**
 * How far along the handle ray the stub sits: the preferred length when
 * that point is clear, otherwise the nearest clear point (as short as
 * `MINIMUM_STUB`). Adjacent shapes' clearance zones can overlap, leaving
 * only a thin window on the ray — a fixed stub length would land inside
 * the neighbour and make the whole route look impossible. Returns `null`
 * when no point on the ray is clear (fully enclosed — the caller falls
 * back to the plain path).
 */
function stubDistance(
  endpoint: RoutePoint,
  normal: [number, number],
  boxes: ObstacleBox[],
  ownObstacle: ObstacleBox | null,
  preferredStub: number,
): number | null {
  const candidateAt = (d: number): RoutePoint => ({
    x: endpoint.x + normal[0] * d,
    y: endpoint.y + normal[1] * d,
  });
  const isUsable = (d: number) => {
    const candidate = candidateAt(d);
    // The candidate itself must be outside every inflated obstacle, and the
    // endpoint-to-stub segment may cross only the endpoint's own box. This
    // prevents a long stub from jumping through an adjacent node and then
    // handing the grid a falsely reachable point on the far side.
    return (
      !pointInAny(candidate.x, candidate.y, boxes) &&
      !segmentBlockedExcept(
        endpoint.x,
        endpoint.y,
        candidate.x,
        candidate.y,
        boxes,
        ownObstacle,
      )
    );
  };

  // Prefer the normal clearance, then try shorter stubs before detouring
  // farther out. Shorter candidates are the reduced-clearance retry for
  // tightly packed but non-overlapping nodes.
  if (isUsable(preferredStub)) return preferredStub;
  for (let d = preferredStub - 1; d >= MINIMUM_STUB; d--) {
    if (isUsable(d)) return d;
  }
  for (let d = preferredStub + 1; d <= MAXIMUM_STUB; d++) {
    if (isUsable(d)) return d;
  }
  return null;
}

/* ------------------------------- geometry ------------------------------- */

function pointInAny(x: number, y: number, boxes: ObstacleBox[]): boolean {
  for (const b of boxes) {
    if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
  }
  return false;
}

/**
 * Whether a segment enters the open interior of an axis-aligned box. A
 * segment exactly along a box boundary is fine — boxes are inflated, so that
 * boundary still represents the requested clearance from the shape.
 */
function segmentIntersectsInterior(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  box: ObstacleBox,
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return false;

  const interval = (start: number, delta: number, min: number, max: number) => {
    if (delta === 0) return start > min && start < max ? [0, 1] : null;
    const a = (min - start) / delta;
    const b = (max - start) / delta;
    return [Math.min(a, b), Math.max(a, b)] as const;
  };
  const xInterval = interval(x1, dx, box.x, box.x + box.w);
  const yInterval = interval(y1, dy, box.y, box.y + box.h);
  if (!xInterval || !yInterval) return false;
  const enter = Math.max(0, xInterval[0], yInterval[0]);
  const exit = Math.min(1, xInterval[1], yInterval[1]);
  return enter < exit;
}

function segmentBlocked(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  boxes: ObstacleBox[],
): boolean {
  return segmentBlockedExcept(x1, y1, x2, y2, boxes, null);
}

function segmentBlockedExcept(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  boxes: ObstacleBox[],
  ignored: ObstacleBox | null,
): boolean {
  return boxes.some(
    (box) => box !== ignored && segmentIntersectsInterior(x1, y1, x2, y2, box),
  );
}

/* ------------------------------ Hanan grid ------------------------------ */

interface GridPoint {
  x: number;
  y: number;
  east: number;
  south: number;
  west: number;
  north: number;
}

/**
 * Build the Hanan grid: grid points are the Cartesian product of the x and
 * y axes (stubs, obstacle boundaries, perimeter); a point is valid when it
 * is not inside an inflated obstacle; adjacent points along an axis are
 * connected when the segment between them is clear.
 *
 * Returns `null` when an endpoint is not a valid grid point (it sits inside
 * an inflated obstacle — no legal route can start or end there).
 */
function buildGrid(
  start: RoutePoint,
  end: RoutePoint,
  boxes: ObstacleBox[],
): {
  points: (GridPoint | undefined)[];
  startId: number;
  endId: number;
} | null {
  const xs = new Set<number>([start.x, end.x]);
  const ys = new Set<number>([start.y, end.y]);
  let minX = Math.min(start.x, end.x);
  let minY = Math.min(start.y, end.y);
  let maxX = Math.max(start.x, end.x);
  let maxY = Math.max(start.y, end.y);
  for (const b of boxes) {
    xs.add(b.x);
    xs.add(b.x + b.w);
    ys.add(b.y);
    ys.add(b.y + b.h);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  // Outer perimeter: routes may detour outside all content, but not
  // infinitely far.
  xs.add(minX - PERIMETER_MARGIN);
  xs.add(maxX + PERIMETER_MARGIN);
  ys.add(minY - PERIMETER_MARGIN);
  ys.add(maxY + PERIMETER_MARGIN);

  const sx = [...xs].sort((a, b) => a - b);
  const sy = [...ys].sort((a, b) => a - b);
  const xIndex = new Map<number, number>();
  sx.forEach((v, i) => xIndex.set(v, i));
  const yIndex = new Map<number, number>();
  sy.forEach((v, i) => yIndex.set(v, i));

  const cols = sx.length;
  const rows = sy.length;
  const points: (GridPoint | undefined)[] = Array.from(
    { length: cols * rows },
    () => undefined,
  );
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const x = sx[gx];
      const y = sy[gy];
      if (pointInAny(x, y, boxes)) continue; // invalid: inside an obstacle
      points[gy * cols + gx] = {
        x,
        y,
        east: -1,
        south: -1,
        west: -1,
        north: -1,
      };
    }
  }
  // Connectivity: adjacent valid points, symmetric, segment must be clear.
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const p = points[gy * cols + gx];
      if (!p) continue;
      if (gx + 1 < cols) {
        const q = points[gy * cols + gx + 1];
        if (q && !segmentBlocked(p.x, p.y, q.x, q.y, boxes)) {
          p.east = gy * cols + gx + 1;
          q.west = gy * cols + gx;
        }
      }
      if (gy + 1 < rows) {
        const q = points[(gy + 1) * cols + gx];
        if (q && !segmentBlocked(p.x, p.y, q.x, q.y, boxes)) {
          p.south = (gy + 1) * cols + gx;
          q.north = gy * cols + gx;
        }
      }
    }
  }

  const startGi = xIndex.get(start.x);
  const startGj = yIndex.get(start.y);
  const endGi = xIndex.get(end.x);
  const endGj = yIndex.get(end.y);
  if (startGi === undefined || startGj === undefined) return null;
  if (endGi === undefined || endGj === undefined) return null;
  const startId = startGj * cols + startGi;
  const endId = endGj * cols + endGi;
  if (!points[startId] || !points[endId]) return null;
  return { points, startId, endId };
}

/* --------------------------------- A* ---------------------------------- */

const DIRS = [
  { axis: "east" as const },
  { axis: "west" as const },
  { axis: "north" as const },
  { axis: "south" as const },
];

interface SearchCost {
  reversals: number;
  bends: number;
  length: number;
}

interface HeapEntry extends SearchCost {
  estimatedLength: number;
  sequence: number;
  state: number;
}

/** Min-heap over the lexicographic A* cost tuple; deterministic on ties. */
class Heap {
  private heap: HeapEntry[] = [];
  get size(): number {
    return this.heap.length;
  }
  push(cost: SearchCost, estimatedLength: number, sequence: number, state: number): void {
    const h = this.heap;
    h.push({ ...cost, estimatedLength, sequence, state });
    let i = h.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (compareHeapEntries(h[i], h[parent]) < 0) {
        [h[i], h[parent]] = [h[parent], h[i]];
        i = parent;
      } else break;
    }
  }
  pop(): HeapEntry {
    const h = this.heap;
    const top = h[0];
    if (!top) throw new Error("Cannot pop an empty routing heap");
    const last = h.pop();
    if (!last) return top;
    if (h.length > 0) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let smallest = i;
        if (l < h.length && compareHeapEntries(h[l], h[smallest]) < 0) smallest = l;
        if (r < h.length && compareHeapEntries(h[r], h[smallest]) < 0) smallest = r;
        if (smallest === i) break;
        [h[i], h[smallest]] = [h[smallest], h[i]];
        i = smallest;
      }
    }
    return top;
  }
}

function compareCost(a: SearchCost, b: SearchCost): number {
  return a.reversals - b.reversals || a.bends - b.bends || a.length - b.length;
}

function compareHeapEntries(a: HeapEntry, b: HeapEntry): number {
  return (
    a.reversals - b.reversals ||
    a.bends - b.bends ||
    a.estimatedLength - b.estimatedLength ||
    a.sequence - b.sequence
  );
}

/**
 * A* over (point, current direction, last horizontal direction, last
 * vertical direction) states. Direction 4 means "the start". Remembering
 * the last direction on each axis lets the cost function recognize a
 * separated U-turn such as east → south → west, not just an immediate
 * east → west reversal.
 */
function search(grid: {
  points: (GridPoint | undefined)[];
  startId: number;
  endId: number;
}): RoutePoint[] | null {
  const { points, startId, endId } = grid;
  const stateStride = 5 * 3 * 3;
  const states = points.length * stateStride;
  const costs: (SearchCost | undefined)[] = Array.from(
    { length: states },
    () => undefined,
  );
  const cameFrom = new Int32Array(states).fill(-1);
  const closed = new Uint8Array(states);
  const heap = new Heap();
  const stateOf = (point: number, dir: number, horizontal: number, vertical: number) =>
    ((point * 5 + dir) * 3 + horizontal + 1) * 3 + vertical + 1;
  const decode = (state: number) => {
    const axisState = state % 9;
    const directionState = Math.floor(state / 9);
    return {
      point: Math.floor(directionState / 5),
      dir: directionState % 5,
      horizontal: Math.floor(axisState / 3) - 1,
      vertical: axisState % 3 - 1,
    };
  };

  // Heuristic: manhattan distance to the goal (admissible — penalties only add).
  const goal = points[endId];
  if (!goal) return null;
  const h = (point: number) => {
    const p = points[point];
    return p ? Math.abs(p.x - goal.x) + Math.abs(p.y - goal.y) : Infinity;
  };

  const startState = stateOf(startId, 4, 0, 0);
  const startCost: SearchCost = { reversals: 0, bends: 0, length: 0 };
  costs[startState] = startCost;
  heap.push(startCost, h(startId), 0, startState);
  let seq = 1;

  while (heap.size > 0) {
    const { state } = heap.pop();
    if (closed[state]) continue;
    closed[state] = 1;
    const { point, dir, horizontal, vertical } = decode(state);
    if (point === endId) {
      const path: RoutePoint[] = [];
      let cursor = state;
      while (cursor !== -1) {
        const p = points[decode(cursor).point];
        if (!p) return null;
        path.push(p);
        cursor = cameFrom[cursor];
      }
      const reversed: RoutePoint[] = [];
      for (let i = path.length - 1; i >= 0; i--) {
        const p = path[i];
        if (p) reversed.push(p);
      }
      return simplifyCollinear(reversed);
    }
    const p = points[point];
    if (!p) continue;
    for (let di = 0; di < 4; di++) {
      const nextId = p[DIRS[di].axis];
      if (nextId < 0) continue;
      const np = points[nextId];
      if (!np) continue;
      const step = Math.abs(np.x - p.x) + Math.abs(np.y - p.y);
      const movesHorizontal = di < 2;
      const moveDirection = di === 0 || di === 3 ? 1 : -1;
      const previousAxisDirection = movesHorizontal ? horizontal : vertical;
      const reversal =
        previousAxisDirection !== 0 && previousAxisDirection !== moveDirection
          ? 1
          : 0;
      const nextHorizontal = movesHorizontal ? moveDirection : horizontal;
      const nextVertical = movesHorizontal ? vertical : moveDirection;
      const currentCost = costs[state];
      if (!currentCost) continue;
      const nextCost: SearchCost = {
        reversals: currentCost.reversals + reversal,
        bends: currentCost.bends + (dir === 4 || di === dir ? 0 : 1),
        length: currentCost.length + step,
      };
      const ns = stateOf(nextId, di, nextHorizontal, nextVertical);
      const previousCost = costs[ns];
      if (!previousCost || compareCost(nextCost, previousCost) < 0) {
        costs[ns] = nextCost;
        cameFrom[ns] = state;
        heap.push(nextCost, nextCost.length + h(nextId), seq++, ns);
      }
    }
  }
  return null;
}

/** Drop points that lie on the same straight run as their neighbours. */
function simplifyCollinear(path: RoutePoint[]): RoutePoint[] {
  if (path.length <= 2) return path;
  const first = path[0];
  const last = path.at(-1);
  if (!first || !last) return [];
  const out: RoutePoint[] = [first];
  for (let i = 1; i < path.length - 1; i++) {
    const a = out.at(-1);
    if (!a) return [];
    const b = path[i];
    const c = path[i + 1];
    const collinear =
      (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
    if (!collinear) out.push(b);
  }
  out.push(last);
  return out;
}

function estimatedGridPointCount(boxes: ObstacleBox[]): number {
  // Each obstacle contributes two coordinates per axis; endpoints and the
  // outer perimeter add four more. This matches buildGrid's worst-case
  // Cartesian product without allocating the grid.
  return (boxes.length * 2 + 4) ** 2;
}

/* -------------------------------- output -------------------------------- */

function toPath(points: RoutePoint[]): string {
  const fmt = (n: number) => String(Math.round(n * 100) / 100);
  let d = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${fmt(points[i].x)} ${fmt(points[i].y)}`;
  }
  return d;
}

function midpointOf(points: RoutePoint[]): RoutePoint {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y,
    );
  }
  let remaining = total / 2;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    // Land on this segment once less than its length remains (or it is the
    // last one); otherwise walk past it and keep the leftover distance.
    if (remaining < seg || i === points.length - 1) {
      const t = seg === 0 ? 0 : Math.min(1, remaining / seg);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    remaining -= seg;
  }
  return points.at(-1) ?? points[0];
}

/** Remove consecutive duplicate points. */
function dedupe(points: RoutePoint[]): RoutePoint[] {
  return points.filter(
    (p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y,
  );
}

/**
 * Route an edge from handle to handle around the node boxes.
 * Returns `null` when the grid has no legal route (overlapping/enclosed
 * nodes) so the caller can fall back to the plain smooth-step path.
 */
export function routeOrthogonalEdge(request: RouteRequest): RoutedEdge | null {
  const {
    source,
    target,
    sourceNormal,
    targetNormal,
    obstacles: rawObstacles,
    sourceObstacle: rawSourceObstacle,
    targetObstacle: rawTargetObstacle,
  } = request;

  // A full clearance is preferred. Packed diagrams can make that clearance
  // impossible even though a legal route exists, so retry at half and then
  // zero clearance before conceding to the caller's fallback.
  for (const clearance of [ROUTE_CLEARANCE, ROUTE_CLEARANCE / 2, 0]) {
    const entries = rawObstacles.map((raw) => ({
      raw,
      box: {
        x: raw.x - clearance,
        y: raw.y - clearance,
        w: raw.w + clearance * 2,
        h: raw.h + clearance * 2,
      },
    }));
    const obstacles = entries.map(({ box }) => box);
    if (estimatedGridPointCount(obstacles) > MAX_ROUTING_GRID_POINTS) {
      return null;
    }
    const sourceObstacle = rawSourceObstacle
      ? entries.find(({ raw }) => raw === rawSourceObstacle)?.box ?? null
      : null;
    const targetObstacle = rawTargetObstacle
      ? entries.find(({ raw }) => raw === rawTargetObstacle)?.box ?? null
      : null;

    // The routed part starts/ends at stubs just outside the anchored nodes;
    // a free (dragged) end has no stub and routes from the point itself.
    let start = source;
    if (sourceNormal) {
      const d = stubDistance(
        source,
        sourceNormal,
        obstacles,
        sourceObstacle,
        clearance + STUB_OFFSET,
      );
      if (d === null) continue;
      start = {
        x: source.x + sourceNormal[0] * d,
        y: source.y + sourceNormal[1] * d,
      };
    }
    let end = target;
    if (targetNormal) {
      const d = stubDistance(
        target,
        targetNormal,
        obstacles,
        targetObstacle,
        clearance + STUB_OFFSET,
      );
      if (d === null) continue;
      end = {
        x: target.x + targetNormal[0] * d,
        y: target.y + targetNormal[1] * d,
      };
    }

    const grid = buildGrid(start, end, obstacles);
    if (!grid) continue;
    const waypoints = search(grid);
    if (!waypoints) continue;

    // `waypoints` runs start → end; the endpoint-to-stub stubs are the
    // segments source → waypoints[0] and waypoints[last] → target.
    const full = dedupe(simplifyCollinear([source, ...waypoints, target]));
    if (full.length < 2) continue;
    return { path: toPath(full), labelPoint: midpointOf(full) };
  }
  return null;
}
