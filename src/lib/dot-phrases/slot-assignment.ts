import type { Point } from "./types";

function sortedIndexes(points: ReadonlyArray<Point>): number[] {
  const angle = (point: Point) => (Math.atan2(point.y, point.x) + 2 * Math.PI) % (2 * Math.PI);
  return points.map((_, index) => index).sort((a, b) => {
    const first = points[a];
    const second = points[b];
    return angle(first) - angle(second)
      || Math.hypot(first.x, first.y) - Math.hypot(second.x, second.y)
      || a - b;
  });
}

export function assignSlotsByAngle(slotOffsets: ReadonlyArray<Point>, targetOffsets: ReadonlyArray<Point>): number[] {
  if (slotOffsets.length !== targetOffsets.length) throw new Error("Slot and target counts differ");
  const slots = sortedIndexes(slotOffsets);
  const targets = sortedIndexes(targetOffsets);
  const result: number[] = [];
  targets.forEach((target, index) => { result[target] = slots[index]; });
  return result;
}
