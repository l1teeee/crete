import type { HexagonSlot } from "./types";

export function hexagonDotCount(rings: number): number {
  return 1 + 3 * rings * (rings + 1);
}

export function ringsForDotCount(minDots: number): number {
  let rings = 0;
  while (hexagonDotCount(rings) < minDots) rings++;
  return rings;
}

export function hexagonSlots(rings: number, spacing: number): ReadonlyArray<HexagonSlot> {
  const slots: HexagonSlot[] = [];
  for (let q = -rings; q <= rings; q++) {
    for (let r = -rings; r <= rings; r++) {
      const ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
      if (ring <= rings) {
        slots.push({ offset: { x: spacing * (q + r / 2), y: spacing * r * Math.sqrt(3) / 2 }, ring });
      }
    }
  }
  const angle = (slot: HexagonSlot) => (Math.atan2(slot.offset.y, slot.offset.x) + 2 * Math.PI) % (2 * Math.PI);
  return slots.sort((a, b) => a.ring - b.ring || angle(a) - angle(b));
}
