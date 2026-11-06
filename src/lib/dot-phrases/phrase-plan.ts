import { DESCENDER_HEIGHT, GLYPHS, GLYPH_HEIGHT } from "./glyphs";
import { buildInkPath } from "./ink-path";
import { createRandom, hashString, signed } from "./prng";
import type { Glyph, InkStroke, PhrasePlan, PlanBlock, PlannedPhrase, Point } from "./types";

export const LETTER_GAP = 2;
export const SPACE_WIDTH = 4;
const BLOCK_PAUSE_SECONDS = 0.25;
const STROKE_GAP_MIN = 0.04;
const STROKE_GAP_MAX = 0.16;
const PLAN_MARGIN = 2;
const GLYPH_OFFSET_X = 0.3;
const GLYPH_OFFSET_Y = 0.9;
const GLYPH_SCALE_VARIATION = 0.1;
const GLYPH_ROTATION = 0.07;
const GLYPH_PIVOT_Y = 5;
const POINT_JITTER = 0.25;
const LINE_SLOPE = 0.03;
const TITTLE_SECONDS = 0.12;
const SEED_OFFSET = 2;
const DOUBLE = 2;
const LABEL_MIN_LENGTH = 0.25;
const LOWERCASE_SCALE = 0.62;

function glyphSizeFactor(char: string): number {
  return char >= "a" && char <= "z" ? LOWERCASE_SCALE : 1;
}

function characterWidth(char: string): number {
  if (char === " ") return SPACE_WIDTH;
  if (!Object.hasOwn(GLYPHS, char)) throw new Error(`No glyph for "${char}"`);
  return GLYPHS[char].width * glyphSizeFactor(char);
}

function lineWidth(line: string): number {
  const chars = Array.from(line);
  return chars.reduce((width, char) => width + characterWidth(char), 0) + LETTER_GAP * (chars.length - 1);
}

type GlyphPlacement = { x: number; y: number; slope: number; centerX: number };

function addGlyph(glyph: Glyph, sizeFactor: number, placement: GlyphPlacement, dots: Point[], strokes: InkStroke[], random: () => number): void {
  const dx = signed(random, GLYPH_OFFSET_X);
  const dy = signed(random, GLYPH_OFFSET_Y);
  const scale = 1 + signed(random, GLYPH_SCALE_VARIATION);
  const angle = signed(random, GLYPH_ROTATION);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const width = glyph.width * sizeFactor;
  const indexes = new Map<number, number>();
  for (const stroke of glyph.strokes) {
    const dotIndexes = stroke.map((index) => {
      const existing = indexes.get(index);
      if (existing !== undefined) return existing;
      const [pointX, pointY] = glyph.points[index];
      const px = pointX * sizeFactor;
      const py = GLYPH_HEIGHT + (pointY - GLYPH_HEIGHT) * sizeFactor;
      const rx = (px - width / DOUBLE) * scale;
      const ry = (py - GLYPH_PIVOT_Y) * scale;
      const x = placement.x + width / DOUBLE + rx * cos - ry * sin + dx + signed(random, POINT_JITTER);
      const y = placement.y + GLYPH_PIVOT_Y + rx * sin + ry * cos + dy
        + placement.slope * (placement.x + width / DOUBLE - placement.centerX) + signed(random, POINT_JITTER);
      const dotIndex = dots.length;
      indexes.set(index, dotIndex);
      dots.push({ x, y });
      return dotIndex;
    });
    const path = buildInkPath(dotIndexes.map((index) => dots[index]), random);
    const start = strokes.length ? strokes[strokes.length - 1].end + STROKE_GAP_MIN + random() * (STROKE_GAP_MAX - STROKE_GAP_MIN) : 0;
    const duration = path.length === 1 ? TITTLE_SECONDS : path[path.length - 1].time;
    strokes.push({ dotIndexes, path, start, end: start + duration });
  }
}

function labelDirections(dots: Point[], strokes: InkStroke[]): Point[] {
  const neighbors: number[][] = dots.map(() => []);
  for (const stroke of strokes) {
    for (let i = 1; i < stroke.dotIndexes.length; i++) {
      const a = stroke.dotIndexes[i - 1];
      const b = stroke.dotIndexes[i];
      neighbors[a].push(b);
      neighbors[b].push(a);
    }
  }
  return dots.map((dot, index) => {
    if (neighbors[index].length === 0) return { x: 0, y: -1 };
    const vectors = neighbors[index].map((neighbor) => {
      const dx = dots[neighbor].x - dot.x;
      const dy = dots[neighbor].y - dot.y;
      const length = Math.hypot(dx, dy);
      return { x: dx / length, y: dy / length };
    });
    const sum = vectors.reduce((acc, vector) => ({ x: acc.x + vector.x, y: acc.y + vector.y }), { x: 0, y: 0 });
    const length = Math.hypot(sum.x, sum.y);
    return length >= LABEL_MIN_LENGTH ? { x: -sum.x / length, y: -sum.y / length } : { x: -vectors[0].y, y: vectors[0].x };
  });
}

export function planPhrase(lines: ReadonlyArray<string>, random: () => number): PhrasePlan {
  const blocks: PlanBlock[] = [];
  const dotPoints: Point[] = [];
  const strokes: InkStroke[] = [];
  lines.forEach((line, lineIndex) => {
    const size = { width: lineWidth(line) + DOUBLE * PLAN_MARGIN, height: GLYPH_HEIGHT + DESCENDER_HEIGHT + DOUBLE * PLAN_MARGIN };
    const firstDot = dotPoints.length;
    const firstStroke = strokes.length;
    const slope = signed(random, LINE_SLOPE);
    let cursorX = PLAN_MARGIN;
    const cursorY = PLAN_MARGIN;
    for (const char of line) {
      const width = characterWidth(char);
      if (char !== " ") addGlyph(GLYPHS[char], glyphSizeFactor(char), { x: cursorX, y: cursorY, slope, centerX: size.width / DOUBLE }, dotPoints, strokes, random);
      cursorX += width + LETTER_GAP;
    }
    if (lineIndex > 0) {
      for (let i = firstStroke; i < strokes.length; i++) {
        strokes[i] = { ...strokes[i], start: strokes[i].start + BLOCK_PAUSE_SECONDS, end: strokes[i].end + BLOCK_PAUSE_SECONDS };
      }
    }
    blocks.push({ size, firstDot, dotCount: dotPoints.length - firstDot });
  });
  return { blocks, dotPoints, labelDirections: labelDirections(dotPoints, strokes), strokes, inkDuration: strokes.length ? strokes[strokes.length - 1].end : 0 };
}

export function planPhrases(phrases: ReadonlyArray<ReadonlyArray<string>>): ReadonlyArray<PlannedPhrase> {
  return phrases.map((lines) => {
    const seed = hashString(lines.join("|"));
    return { plan: planPhrase(lines, createRandom(seed + SEED_OFFSET)), seed };
  });
}
