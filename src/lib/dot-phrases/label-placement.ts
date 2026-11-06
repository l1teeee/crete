import { dotRadius, inkWidth, labelFontSize } from "./sizing";
import type { Point, Size } from "./types";

const LABEL_CHAR_WIDTH_EM = 0.62;
const LABEL_PADDING = 1.5;
const LABEL_GAP = 3;
const EDGE_MARGIN = 2;
const DIRECTION_STEPS = 24;
const RING_FACTORS = [1, 1.35, 1.75, 2.2, 2.8];
const DOT_CLEARANCE = 1;
const STROKE_CLEARANCE = 1;
const EDGE_WEIGHT = 4;
const LABEL_WEIGHT = 3;
const DOT_WEIGHT = 2;
const STROKE_WEIGHT = 1;
const ZERO = 0;
const ONE = 1;
const TWO = 2;
const ANGLE_TOLERANCE = 1e-10;

export type LabelRequest = { readonly position: Point; readonly label: string; readonly preferred: Point };
type Box = { left: number; right: number; top: number; bottom: number };
type Segment = { a: Point; b: Point };
type PlacementContext = { requests: ReadonlyArray<LabelRequest>; segments: Segment[]; size: Size; radius: number; strokeHalf: number };

function directions(preferred: Point): Point[] {
  const angle = Math.atan2(preferred.y, preferred.x);
  const step = TWO * Math.PI / DIRECTION_STEPS;
  const angles = Array.from({ length: DIRECTION_STEPS }, (_, index) => index * step);
  const turn = (value: number) => ((value - angle + Math.PI + TWO * Math.PI) % (TWO * Math.PI)) - Math.PI;
  return angles.sort((a, b) => {
    const difference = Math.abs(turn(a)) - Math.abs(turn(b));
    return Math.abs(difference) < ANGLE_TOLERANCE ? turn(b) - turn(a) : difference;
  })
    .map((value) => ({ x: Math.cos(value), y: Math.sin(value) }));
}

function candidateBox(position: Point, direction: Point, ring: number, width: number, height: number, radius: number): Box {
  const distance = ring * (radius + LABEL_GAP + Math.abs(direction.x) * width / TWO + Math.abs(direction.y) * height / TWO);
  const x = position.x + direction.x * distance;
  const y = position.y + direction.y * distance;
  return { left: x - width / TWO, right: x + width / TWO, top: y - height / TWO, bottom: y + height / TWO };
}

function overlaps(a: Box, b: Box): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

function dotOverlaps(box: Box, point: Point, radius: number): boolean {
  const x = Math.max(box.left, Math.min(box.right, point.x));
  const y = Math.max(box.top, Math.min(box.bottom, point.y));
  return (point.x - x) ** TWO + (point.y - y) ** TWO <= radius ** TWO;
}

function segmentIntersects(box: Box, { a, b }: Segment): boolean {
  if (Math.max(a.x, b.x) < box.left || Math.min(a.x, b.x) > box.right
    || Math.max(a.y, b.y) < box.top || Math.min(a.y, b.y) > box.bottom) return false;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - box.left, box.right - a.x, a.y - box.top, box.bottom - a.y];
  let low = ZERO;
  let high = ONE;
  for (let i = ZERO; i < p.length; i++) {
    if (p[i] === ZERO) {
      if (q[i] < ZERO) return false;
    } else if (p[i] < ZERO) low = Math.max(low, q[i] / p[i]);
    else high = Math.min(high, q[i] / p[i]);
    if (low > high) return false;
  }
  return true;
}

function violations(box: Box, index: number, placed: Box[], context: PlacementContext): number {
  const { requests, segments, size, radius, strokeHalf } = context;
  let count = box.left < EDGE_MARGIN || box.top < EDGE_MARGIN
    || box.right > size.width - EDGE_MARGIN || box.bottom > size.height - EDGE_MARGIN ? EDGE_WEIGHT : ZERO;
  for (const other of placed) if (overlaps(box, other)) count += LABEL_WEIGHT;
  requests.forEach((request, otherIndex) => {
    if (otherIndex !== index && dotOverlaps(box, request.position, radius + DOT_CLEARANCE)) count += DOT_WEIGHT;
  });
  const padding = strokeHalf + STROKE_CLEARANCE;
  const inflated = { left: box.left - padding, right: box.right + padding, top: box.top - padding, bottom: box.bottom + padding };
  for (const segment of segments) if (segmentIntersects(inflated, segment)) count += STROKE_WEIGHT;
  return count;
}

function chooseBox(request: LabelRequest, index: number, placed: Box[], context: PlacementContext, fontSize: number): Box {
  const width = request.label.length * fontSize * LABEL_CHAR_WIDTH_EM + TWO * LABEL_PADDING;
  const height = fontSize + TWO * LABEL_PADDING;
  let best: Box | undefined;
  let fewest = Infinity;
  for (const ring of RING_FACTORS) {
    for (const direction of directions(request.preferred)) {
      const box = candidateBox(request.position, direction, ring, width, height, context.radius);
      const count = violations(box, index, placed, context);
      if (count < fewest) { best = box; fewest = count; }
      if (count === ZERO) return box;
    }
  }
  if (best === undefined) throw new Error("No label candidates");
  return best;
}

export function placeLabels(requests: ReadonlyArray<LabelRequest>, strokes: ReadonlyArray<ReadonlyArray<Point>>, size: Size): Point[] {
  const segments: Segment[] = [];
  for (const stroke of strokes) {
    for (let i = ONE; i < stroke.length; i++) segments.push({ a: stroke[i - ONE], b: stroke[i] });
  }
  const context = { requests, segments, size, radius: dotRadius(size), strokeHalf: inkWidth(size) / TWO };
  const fontSize = labelFontSize(size);
  const placed: Box[] = [];
  return requests.map((request, index) => {
    const box = chooseBox(request, index, placed, context, fontSize);
    placed.push(box);
    return { x: (box.left + box.right) / TWO - request.position.x, y: (box.top + box.bottom) / TWO - request.position.y };
  });
}
