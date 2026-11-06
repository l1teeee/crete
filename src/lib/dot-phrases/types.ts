export type Point = { readonly x: number; readonly y: number };
export type InkPoint = Point & {
  readonly width: number; // pen pressure factor, multiplies the base line width
  readonly time: number; // seconds after the stroke starts when the pen reaches this point
};
export type Size = { readonly width: number; readonly height: number };

// Glyph coordinates are grid units: x in [0, width], y in [0, 11], where 0 is the ascender or cap line, 3 the x-height line, 8 the baseline and 11 the descender line.
export type Glyph = {
  readonly width: number;
  readonly points: ReadonlyArray<readonly [number, number]>;
  readonly strokes: ReadonlyArray<ReadonlyArray<number>>; // indexes into points, drawn in array order
};

// start and end are seconds from the beginning of the ink phase.
export type InkStroke = {
  readonly dotIndexes: ReadonlyArray<number>;
  readonly path: ReadonlyArray<InkPoint>; // child-like pen path through the stroke's dots: grid units in PhrasePlan, px in PhraseLayout; the last point's time is the stroke duration; a one-point path is the dot of an i or j
  readonly start: number;
  readonly end: number;
};

export type PlanBlock = {
  readonly size: Size; // block size in grid units, including the plan margin
  readonly firstDot: number; // index of its first dot in PhrasePlan.dotPoints
  readonly dotCount: number;
};

// Viewport independent plan of one phrase. Every line of the phrase is a block that is placed on its own.
// dotPoints and the stroke paths are block-local grid units: origin at the top-left corner of their block.
export type PhrasePlan = {
  readonly blocks: ReadonlyArray<PlanBlock>;
  readonly dotPoints: ReadonlyArray<Point>; // letter dots in numbering order (index 0 is dot "01")
  readonly labelDirections: ReadonlyArray<Point>; // unit vector per dot, where its number label goes
  readonly strokes: ReadonlyArray<InkStroke>;
  readonly inkDuration: number; // seconds, end of the last stroke
};

export type PlannedPhrase = { readonly plan: PhrasePlan; readonly seed: number };

// Positions and offsets are canvas CSS pixels.
export type PhraseDot = {
  readonly position: Point;
  readonly labelOffset: Point; // from position to the center of the number label
  readonly label: string; // "01", "02", ... zero padded to 2 digits
  readonly isLetter: boolean; // false for decoy dots
};

export type PhraseLayout = {
  readonly dots: ReadonlyArray<PhraseDot>; // letter dots first in numbering order, then decoys; length equals dotCount
  readonly strokes: ReadonlyArray<InkStroke>;
  readonly inkDuration: number;
};

export type HexagonSlot = { readonly offset: Point; readonly ring: number }; // offset from the hexagon center, px

export type ScenePhrase = {
  readonly layout: PhraseLayout;
  readonly slotIndexByDot: ReadonlyArray<number>; // dot index -> index into DotScene.slots
  readonly delays: ReadonlyArray<number>; // per dot, 0..1, target distance from center over the largest distance
  readonly curls: ReadonlyArray<number>; // per dot, signed px amplitude of the sideways arc during flight
};

export type DotScene = {
  readonly size: Size;
  readonly center: Point;
  readonly rings: number;
  readonly slots: ReadonlyArray<HexagonSlot>; // length equals the dot count of every layout
  readonly phrases: ReadonlyArray<ScenePhrase>; // same order as the planned phrases
};
