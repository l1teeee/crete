import { hexagonDotCount, hexagonSlots, ringsForDotCount } from "./hexagon";
import { placePhrase } from "./phrase-layout";
import { createRandom } from "./prng";
import { assignSlotsByAngle } from "./slot-assignment";
import type { DotScene, PlannedPhrase, Size } from "./types";

const MIN_DECOYS = 16;
const HEXAGON_RADIUS_RATIO = 0.15;
const CURL_RATIO = 0.06;

export function buildScene(planned: ReadonlyArray<PlannedPhrase>, size: Size): DotScene {
  const rings = ringsForDotCount(Math.max(...planned.map(({ plan }) => plan.dotPoints.length + MIN_DECOYS)));
  const dotCount = hexagonDotCount(rings);
  const center = { x: size.width / 2, y: size.height / 2 };
  const spacing = Math.min(size.width, size.height) * HEXAGON_RADIUS_RATIO / rings;
  const slots = hexagonSlots(rings, spacing);
  const phrases = planned.map(({ plan, seed }) => {
    const layout = placePhrase(plan, size, dotCount, seed);
    const targetOffsets = layout.dots.map(({ position }) => ({ x: position.x - center.x, y: position.y - center.y }));
    const slotIndexByDot = assignSlotsByAngle(slots.map((slot) => slot.offset), targetOffsets);
    const distances = targetOffsets.map(({ x, y }) => Math.hypot(x, y));
    const largest = Math.max(...distances);
    const delays = distances.map((distance) => largest === 0 ? 0 : distance / largest);
    const random = createRandom(seed + 1);
    const curls = distances.map(() => (random() * 2 - 1) * CURL_RATIO * Math.min(size.width, size.height));
    return { layout, slotIndexByDot, delays, curls };
  });
  return { size, center, rings, slots, phrases };
}
