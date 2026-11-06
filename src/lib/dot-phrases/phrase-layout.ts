import { arrangeBlocks } from "./block-arrangement";
import type { BlockPlacement } from "./block-arrangement";
import { createRandom } from "./prng";
import { placeLabels } from "./label-placement";
import type { PhraseDot, PhraseLayout, PhrasePlan, Point, Size } from "./types";

const DECOY_EDGE_RATIO = 0.04;
const DECOY_SPACING_FACTOR = 0.7;
const DECOY_FREE_AREA_MIN_FACTOR = 0.2;
const DECOY_TEXT_PADDING_UNITS = 2;
const DECOY_ATTEMPTS_PER_SHRINK = 40;
const DECOY_MAX_ATTEMPTS = 5000;
const BLOCK_SEED_OFFSET = 3;
const DOUBLE = 2;
const DECOY_SHRINK = 0.9;
const LABEL_DIGITS = 2;
const FIRST = 1;
const ZERO = 0;

type Rect = { left: number; top: number; width: number; height: number };
type DecoyOptions = { count: number; size: Size; rectangles: ReadonlyArray<Rect>; seed: number };

function grownRectangles(plan: PhrasePlan, placements: ReadonlyArray<BlockPlacement>): Rect[] {
  return plan.blocks.map((block, index) => {
    const { origin, scale } = placements[index];
    const padding = DECOY_TEXT_PADDING_UNITS * scale;
    return { left: origin.x - padding, top: origin.y - padding,
      width: block.size.width * scale + DOUBLE * padding, height: block.size.height * scale + DOUBLE * padding };
  });
}

function addDecoys({ count, size, rectangles, seed }: DecoyOptions): Point[] {
  if (count === ZERO) return [];
  const random = createRandom(seed);
  const edge = Math.min(size.width, size.height) * DECOY_EDGE_RATIO;
  const width = size.width - DOUBLE * edge;
  const height = size.height - DOUBLE * edge;
  const area = width * height;
  const grownArea = rectangles.reduce((sum, rect) => sum + rect.width * rect.height, ZERO);
  const freeArea = Math.max(area - grownArea, area * DECOY_FREE_AREA_MIN_FACTOR);
  let minDistance = DECOY_SPACING_FACTOR * Math.sqrt(freeArea / count);
  let rejected = ZERO;
  let attempts = ZERO;
  const decoys: Point[] = [];
  while (decoys.length < count) {
    if (++attempts > DECOY_MAX_ATTEMPTS) throw new Error("Cannot place decoy dots");
    const position = { x: edge + random() * width, y: edge + random() * height };
    const inside = rectangles.some((rect) => position.x >= rect.left && position.x <= rect.left + rect.width
      && position.y >= rect.top && position.y <= rect.top + rect.height);
    const tooClose = decoys.some((dot) => Math.hypot(dot.x - position.x, dot.y - position.y) < minDistance);
    if (inside || tooClose) {
      if (++rejected % DECOY_ATTEMPTS_PER_SHRINK === ZERO) minDistance *= DECOY_SHRINK;
      continue;
    }
    decoys.push(position);
  }
  return decoys;
}

function toPixels(point: Point, placement: BlockPlacement): Point {
  return { x: placement.origin.x + point.x * placement.scale, y: placement.origin.y + point.y * placement.scale };
}

export function placePhrase(plan: PhrasePlan, size: Size, dotCount: number, seed: number): PhraseLayout {
  if (plan.dotPoints.length > dotCount) throw new Error("Not enough dots");
  const placements = arrangeBlocks(plan.blocks.map((block) => block.size), size, createRandom(seed + BLOCK_SEED_OFFSET));
  const blockOfDot: number[] = [];
  plan.blocks.forEach((block, index) => {
    for (let i = block.firstDot; i < block.firstDot + block.dotCount; i++) blockOfDot[i] = index;
  });
  const positions = plan.dotPoints.map((point, index) => toPixels(point, placements[blockOfDot[index]]));
  positions.push(...addDecoys({ count: dotCount - positions.length, size, rectangles: grownRectangles(plan, placements), seed }));
  const strokes = plan.strokes.map((stroke) => ({
    ...stroke, path: stroke.path.map((point) => ({ ...point, ...toPixels(point, placements[blockOfDot[stroke.dotIndexes[0]]]) })),
  }));
  const requests = positions.map((position, index) => ({
    position,
    label: String(index + FIRST).padStart(LABEL_DIGITS, "0"),
    preferred: index < plan.dotPoints.length ? plan.labelDirections[index] : { x: FIRST, y: ZERO },
  }));
  const offsets = placeLabels(requests, strokes.map((stroke) => stroke.path), size);
  const dots: PhraseDot[] = requests.map((request, index) => ({
    position: request.position, label: request.label, labelOffset: offsets[index], isLetter: index < plan.dotPoints.length,
  }));
  return { dots, strokes, inkDuration: plan.inkDuration };
}
