import { GLYPH_HEIGHT } from "./glyphs";
import { signed } from "./prng";
import type { Point, Size } from "./types";

const MARGIN_RATIO = 0.05;
const MARGIN_MIN = 16;
const GROUP_WIDTH_LANDSCAPE = 0.78;
const GROUP_WIDTH_PORTRAIT = 1;
const GROUP_HEIGHT = 0.6;
const CAP_HEIGHT_RATIO = 0.10;
const WORD_GAP_UNITS = 5;
const LINE_GAP_UNITS = 3;
const SCALE_STEP = 0.97;
const MAX_SCALE_STEPS = 400;
const SIZE_VARIATION = 0.15;
const VERTICAL_JITTER_UNITS = 2.5;
const LINE_SHIFT = 0.25;
const GROUP_SHIFT = 0.35;
const ZERO = 0;
const ONE = 1;
const HALF = 0.5;
const DOUBLE = 2;

export type BlockPlacement = { readonly scale: number; readonly origin: Point };
type Area = { margin: number; size: Size; groupWidth: number; groupHeight: number };
type Line = { indexes: number[]; width: number; height: number };
type Layout = { scale: number; lines: Line[]; height: number };
type Shifts = { x: number; y: number; factors: number[]; lines: number[]; jitters: number[] };

function usableArea(viewport: Size): Area {
  const margin = Math.max(MARGIN_MIN, Math.min(viewport.width, viewport.height) * MARGIN_RATIO);
  const size = { width: viewport.width - DOUBLE * margin, height: viewport.height - DOUBLE * margin };
  const widthRatio = viewport.width >= viewport.height ? GROUP_WIDTH_LANDSCAPE : GROUP_WIDTH_PORTRAIT;
  return { margin, size, groupWidth: size.width * widthRatio, groupHeight: size.height * GROUP_HEIGHT };
}

function flowLines(sizes: ReadonlyArray<Size>, maxUnits: number): Line[] | null {
  const lines: Line[] = [];
  let line: Line | undefined;
  for (const [index, size] of sizes.entries()) {
    if (size.width > maxUnits) return null;
    if (!line || line.width + WORD_GAP_UNITS + size.width > maxUnits) {
      line = { indexes: [], width: ZERO, height: ZERO };
      lines.push(line);
    }
    if (line.indexes.length > ZERO) line.width += WORD_GAP_UNITS;
    line.indexes.push(index);
    line.width += size.width;
    line.height = Math.max(line.height, size.height);
  }
  return lines;
}

function findLayout(sizes: ReadonlyArray<Size>, viewport: Size, area: Area): Layout {
  let scale = CAP_HEIGHT_RATIO * viewport.height / GLYPH_HEIGHT;
  for (let step = ZERO; step < MAX_SCALE_STEPS; step++) {
    const lines = flowLines(sizes, area.groupWidth / scale);
    if (lines) {
      const height = lines.reduce((sum, line) => sum + line.height, ZERO)
        + LINE_GAP_UNITS * (lines.length - ONE);
      if (height * scale <= area.groupHeight) return { scale, lines, height };
    }
    scale *= SCALE_STEP;
  }
  throw new Error("Cannot arrange blocks");
}

function randomShifts(count: number, lineCount: number, random: () => number): Shifts {
  const x = signed(random, GROUP_SHIFT);
  const y = signed(random, GROUP_SHIFT);
  const factors = Array.from({ length: count }, () => ONE - random() * SIZE_VARIATION);
  const lines = Array.from({ length: lineCount }, () => signed(random, LINE_SHIFT));
  const jitters = Array.from({ length: count }, () => signed(random, VERTICAL_JITTER_UNITS));
  return { x, y, factors, lines, jitters };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function placeLine(line: Line, lineIndex: number, top: number, sizes: ReadonlyArray<Size>,
  viewport: Size, area: Area, layout: Layout, shifts: Shifts, placements: BlockPlacement[]): void {
  const { scale } = layout;
  const width = line.indexes.reduce((sum, index) => sum + sizes[index].width * scale * shifts.factors[index], ZERO)
    + (line.indexes.length - ONE) * WORD_GAP_UNITS * scale;
  const alignment = clamp(HALF + shifts.x * HALF + shifts.lines[lineIndex], ZERO, ONE);
  let left = area.margin + (area.size.width - width) * alignment;
  for (const index of line.indexes) {
    const blockScale = scale * shifts.factors[index];
    const blockWidth = sizes[index].width * blockScale;
    const blockHeight = sizes[index].height * blockScale;
    const y = top + (line.height * scale - blockHeight) / DOUBLE + shifts.jitters[index] * scale;
    placements[index] = { scale: blockScale, origin: {
      x: clamp(left, area.margin, viewport.width - area.margin - blockWidth),
      y: clamp(y, area.margin, viewport.height - area.margin - blockHeight),
    } };
    left += blockWidth + WORD_GAP_UNITS * scale;
  }
}

function placeBlocks(sizes: ReadonlyArray<Size>, viewport: Size, area: Area,
  layout: Layout, shifts: Shifts): BlockPlacement[] {
  const placements: BlockPlacement[] = [];
  let top = area.margin + (area.size.height - layout.height * layout.scale) / DOUBLE * (ONE + shifts.y);
  layout.lines.forEach((line, index) => {
    placeLine(line, index, top, sizes, viewport, area, layout, shifts, placements);
    top += (line.height + LINE_GAP_UNITS) * layout.scale;
  });
  return placements;
}

export function arrangeBlocks(sizes: ReadonlyArray<Size>, viewport: Size, random: () => number): BlockPlacement[] {
  if (sizes.length === ZERO) return [];
  const area = usableArea(viewport);
  const layout = findLayout(sizes, viewport, area);
  const shifts = randomShifts(sizes.length, layout.lines.length, random);
  return placeBlocks(sizes, viewport, area, layout, shifts);
}
