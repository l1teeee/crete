import type { Size } from "./types";

const DOT_RATIO = 0.0045;
const DOT_MIN = 1.5;
const DOT_MAX = 3;
const LABEL_RATIO = 0.026;
const LABEL_MIN = 10;
const LABEL_MAX = 13;
const INK_RATIO = 0.0062;
const INK_MIN = 2.2;
const INK_MAX = 3.8;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function dotRadius(size: Size): number {
  return clamp(Math.min(size.width, size.height) * DOT_RATIO, DOT_MIN, DOT_MAX);
}

export function labelFontSize(size: Size): number {
  return clamp(Math.min(size.width, size.height) * LABEL_RATIO, LABEL_MIN, LABEL_MAX);
}

export function inkWidth(size: Size): number {
  return clamp(Math.min(size.width, size.height) * INK_RATIO, INK_MIN, INK_MAX);
}
