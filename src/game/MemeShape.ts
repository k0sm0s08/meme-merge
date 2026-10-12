import type Phaser from 'phaser';
import { PHYSICS, levelConfig } from '../config/gameConfig';

export interface ShapePoint { x: number; y: number; isInternal?: boolean }
export interface MemeShape {
  level: number;
  diameter: number;
  originX: number;
  originY: number;
  radius: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  parts: ShapePoint[][];
  contour: ShapePoint[];
  tolerance: number;
  roundRadius?: number;
}
const shapes = new Map<number, MemeShape>();
const ALPHA_THRESHOLD = 64;

/** One startup pass: keep the largest connected silhouette, ignoring faint isolated specks. */
function silhouette(canvas: HTMLCanvasElement): Uint8Array {
  const { width, height } = canvas;
  const pixels = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, width, height).data;
  const mask = Uint8Array.from({ length: width * height }, (_, i) => Number(pixels[i * 4 + 3] >= ALPHA_THRESHOLD));
  const seen = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let largest: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let read = 0;
    let write = 1;
    queue[0] = start;
    seen[start] = 1;
    while (read < write) {
      const point = queue[read++];
      const x = point % width;
      const neighbors = [point - width, point + width, x > 0 ? point - 1 : -1, x < width - 1 ? point + 1 : -1];
      for (const next of neighbors) {
        if (next >= 0 && next < mask.length && mask[next] && !seen[next]) { seen[next] = 1; queue[write++] = next; }
      }
    }
    if (write > largest.length) largest = Array.from(queue.subarray(0, write));
  }
  const connected = new Uint8Array(mask.length);
  for (const point of largest) connected[point] = 1;
  return connected;
}

/** Walk directed pixel edges. Interior holes do not affect the exposed collision boundary. */
function trace(mask: Uint8Array, width: number, height: number): ShapePoint[] {
  interface Edge { end: number; direction: number; used: boolean }
  const edges = new Map<number, Edge[]>();
  const stride = width + 1;
  const add = (x: number, y: number, nx: number, ny: number, direction: number) => {
    const key = y * stride + x;
    const list = edges.get(key) ?? [];
    list.push({ end: ny * stride + nx, direction, used: false });
    edges.set(key, list);
  };
  const solid = (x: number, y: number) => x >= 0 && x < width && y >= 0 && y < height && mask[y * width + x];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!solid(x, y)) continue;
    if (!solid(x, y - 1)) add(x, y, x + 1, y, 0);
    if (!solid(x + 1, y)) add(x + 1, y, x + 1, y + 1, 1);
    if (!solid(x, y + 1)) add(x + 1, y + 1, x, y + 1, 2);
    if (!solid(x - 1, y)) add(x, y + 1, x, y, 3);
  }
  let largest: ShapePoint[] = [];
  let largestArea = 0;
  for (const [start, candidates] of edges) for (const first of candidates) {
    if (first.used) continue;
    const loop: ShapePoint[] = [];
    let key = start;
    let edge: Edge | undefined = first;
    while (edge && !edge.used) {
      loop.push({ x: key % stride, y: Math.floor(key / stride) });
      edge.used = true;
      key = edge.end;
      if (key === start) break;
      const outgoing = (edges.get(key) ?? []).filter((candidate) => !candidate.used);
      const turns: number[] = [(edge.direction + 1) % 4, edge.direction, (edge.direction + 3) % 4, (edge.direction + 2) % 4];
      edge = turns.map((direction) => outgoing.find((candidate) => candidate.direction === direction)).find(Boolean);
    }
    const area = loop.reduce((sum, point, i) => {
      const next = loop[(i + 1) % loop.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0);
    if (area > largestArea) { largestArea = area; largest = loop; }
  }
  if (largest.length < 3) throw new Error('Не найден контур мема');
  return largest;
}

function distanceSquared(point: ShapePoint, a: ShapePoint, b: ShapePoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return (point.x - a.x - t * dx) ** 2 + (point.y - a.y - t * dy) ** 2;
}

function simplifyOpen(points: ShapePoint[], epsilon: number): ShapePoint[] {
  let index = 0;
  let maximum = epsilon * epsilon;
  for (let i = 1; i < points.length - 1; i++) {
    const distance = distanceSquared(points[i], points[0], points.at(-1)!);
    if (distance > maximum) { maximum = distance; index = i; }
  }
  if (!index) return [points[0], points.at(-1)!];
  return [...simplifyOpen(points.slice(0, index + 1), epsilon).slice(0, -1), ...simplifyOpen(points.slice(index), epsilon)];
}

function simplify(points: ShapePoint[], epsilon: number): ShapePoint[] {
  let split = 1;
  for (let i = 2; i < points.length; i++) {
    if (distanceSquared(points[i], points[0], points[0]) > distanceSquared(points[split], points[0], points[0])) split = i;
  }
  return [...simplifyOpen(points.slice(0, split + 1), epsilon).slice(0, -1), ...simplifyOpen([...points.slice(split), points[0]], epsilon).slice(0, -1)];
}

const area = (points: ShapePoint[]): number => Math.abs(points.reduce((sum, point, i) => {
  const next = points[(i + 1) % points.length];
  return sum + point.x * next.y - next.x * point.y;
}, 0)) / 2;

function hull(points: ShapePoint[]): ShapePoint[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (a: ShapePoint, b: ShapePoint, c: ShapePoint) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const half = (items: ShapePoint[]) => {
    const result: ShapePoint[] = [];
    for (const point of items) {
      while (result.length > 1 && cross(result.at(-2)!, result.at(-1)!, point) <= 0) result.pop();
      result.push(point);
    }
    return result.slice(0, -1);
  };
  return [...half(sorted), ...half(sorted.reverse())].map(({ x, y }) => ({ x, y }));
}

/** Merge neighboring convex pieces only when their union is exactly convex; never fill concavities. */
function compactParts(input: ShapePoint[][]): ShapePoint[][] {
  const parts = [...input];
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let a = 0; a < parts.length; a++) for (let b = a + 1; b < parts.length; b++) {
      const merged = hull([...parts[a], ...parts[b]]);
      if (Math.abs(area(merged) - area(parts[a]) - area(parts[b])) < 1e-6) {
        parts[a] = merged; parts.splice(b, 1); changed = true; break outer;
      }
    }
  }
  const same = (a: ShapePoint, b: ShapePoint) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;
  for (const part of parts) for (let i = 0; i < part.length; i++) {
    part[i].isInternal = parts.some((other) => other !== part && other.some((point, j) => same(part[i], other[(j + 1) % other.length]) && same(part[(i + 1) % part.length], point)));
  }
  return parts;
}

/** Bake convex parts once, in game units, with a shared centre-of-mass sprite anchor. */
export function cacheMemeShape(scene: Phaser.Scene, level: number, canvas: HTMLCanvasElement, round = false): void {
  const diameter = levelConfig(level).diameter;
  const outline = trace(silhouette(canvas), canvas.width, canvas.height);
  const scale = diameter / canvas.width;
  let epsilon = 2;
  let contour = simplify(outline, epsilon);
  while (contour.length > 48 && epsilon < 2.5) { epsilon += 0.25; contour = simplify(outline, epsilon); }
  const points = contour.map(({ x, y }) => ({ x: (x - canvas.width / 2) * scale, y: (y - canvas.height / 2) * scale }));
  const template = scene.matter.bodies.fromVertices(0, 0, [points], PHYSICS, true, 0.01, 0.02);
  if (!template) throw new Error(`Не удалось создать хитбокс мема ${level}`);
  const offsetX = Math.min(...points.map((point) => point.x)) - template.bounds.min.x;
  const offsetY = Math.min(...points.map((point) => point.y)) - template.bounds.min.y;
  const parts = compactParts((template.parts.length > 1 ? template.parts.slice(1) : template.parts).map((part) => part.vertices!.map((vertex) => ({
    x: vertex.x, y: vertex.y, isInternal: Boolean((vertex as unknown as ShapePoint).isInternal),
  }))));
  const vertices = parts.flat();
  shapes.set(level, {
    level, diameter, originX: 0.5 + offsetX / diameter, originY: 0.5 + offsetY / diameter,
    radius: Math.max(...vertices.map(({ x, y }) => Math.hypot(x, y))),
    bounds: { minX: template.bounds.min.x, minY: template.bounds.min.y, maxX: template.bounds.max.x, maxY: template.bounds.max.y },
    parts, contour: points.map(({ x, y }) => ({ x: x - offsetX, y: y - offsetY })), tolerance: epsilon * scale,
    roundRadius: round ? Math.min(-template.bounds.min.x, -template.bounds.min.y, template.bounds.max.x, template.bounds.max.y) : undefined,
  });
}

export function memeShape(level: number): MemeShape {
  const shape = shapes.get(level);
  if (!shape) throw new Error(`Не подготовлен хитбокс уровня ${level}`);
  return shape;
}

/** Convex vertices are already decomposed; spawning performs no image scan or decomposition. */
export function createMemeBody(scene: Phaser.Scene, level: number): MatterJS.BodyType {
  const shape = memeShape(level);
  const options = { ...PHYSICS, label: `meme-${level}`, sleepThreshold: 90 };
  if (shape.roundRadius !== undefined) {
    const body = scene.matter.bodies.circle(0, 0, shape.roundRadius, options, 48);
    scene.matter.body.setInertia(body, body.inertia * 1.7);
    return body;
  }
  const parts = shape.parts.map((vertices) => {
    const part = scene.matter.body.create({ ...options, vertices: vertices.map(({ x, y }) => ({ x, y })) });
    part.vertices!.forEach((vertex, i) => { (vertex as unknown as ShapePoint).isInternal = vertices[i].isInternal; });
    return part;
  });
  const body = parts.length > 1 ? scene.matter.body.create({ ...options, parts }) : parts[0];
  scene.matter.body.setPosition(body, { x: 0, y: 0 });
  scene.matter.body.setInertia(body, body.inertia * 1.7);
  return body;
}
