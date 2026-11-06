import { signed } from "./prng";
import type { InkPoint, Point } from "./types";

const VERTEX_MISS = 0.1;
const STROKE_BOW = 0.08;
const SWAY_AMPLITUDE = 0.05;
const SWAY_HALF_CYCLES_MIN = 2;
const SWAY_HALF_CYCLES_MAX = 4;
const STROKE_ROUGHNESS = 0.04;
const WOBBLE_STEP = 0.7;
const MIN_STEPS = 4;
const OVERSHOOT_MAX = 0.2;
const PRESSURE_VARIATION = 0.3;
const PRESSURE_SLOW_POINTS = 11;
const PRESSURE_FAST_POINTS = 4;
const PRESSURE_MIN = 0.65;
const PRESSURE_MAX = 1.4;
const PRESSURE_LIFT_OFF = 0.7;
const SECONDS_PER_UNIT = 0.010;
const SPEED_VARIATION = 0.35;
const SPEED_WAVE_POINTS = 7;
const CORNER_DWELL_MIN = 0.015;
const CORNER_DWELL_MAX = 0.05;
const SLOW_WEIGHT = 0.6;
const FAST_WEIGHT = 0.4;
const HALF = 0.5;
const DOUBLE = 2;

type Sample = Point & { readonly isCorner: boolean };

function verticesFor(points: ReadonlyArray<Point>, random: () => number): Point[] {
  return points.map((point) => ({
    x: point.x + signed(random, VERTEX_MISS),
    y: point.y + signed(random, VERTEX_MISS),
  }));
}

function addSegment(samples: Sample[], a: Point, b: Point, random: () => number): void {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(MIN_STEPS, Math.ceil(length / WOBBLE_STEP));
  const bow = signed(random, STROKE_BOW);
  const perpendicular = { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
  const control = {
    x: (a.x + b.x) * HALF + perpendicular.x * bow * length,
    y: (a.y + b.y) * HALF + perpendicular.y * bow * length,
  };
  const swayPhase = random() * DOUBLE * Math.PI;
  const swayHalfCycles = SWAY_HALF_CYCLES_MIN + random() * (SWAY_HALF_CYCLES_MAX - SWAY_HALF_CYCLES_MIN);
  for (let i = 1; i <= steps; i++) {
    if (i === steps) {
      samples.push({ ...b, isCorner: true });
      continue;
    }
    const u = i / steps;
    const offset = SWAY_AMPLITUDE * Math.sin(Math.PI * swayHalfCycles * u + swayPhase) * Math.sin(Math.PI * u)
      + signed(random, STROKE_ROUGHNESS);
    samples.push({
      x: (1 - u) ** DOUBLE * a.x + DOUBLE * (1 - u) * u * control.x + u ** DOUBLE * b.x + perpendicular.x * offset,
      y: (1 - u) ** DOUBLE * a.y + DOUBLE * (1 - u) * u * control.y + u ** DOUBLE * b.y + perpendicular.y * offset,
      isCorner: false,
    });
  }
}

function samplesFor(vertices: ReadonlyArray<Point>, random: () => number): Sample[] {
  const samples: Sample[] = [{ ...vertices[0], isCorner: true }];
  for (let i = 1; i < vertices.length; i++) addSegment(samples, vertices[i - 1], vertices[i], random);
  const last = samples[samples.length - 1];
  const previous = samples[samples.length - 2];
  const length = Math.hypot(last.x - previous.x, last.y - previous.y);
  const overshoot = random() * OVERSHOOT_MAX;
  samples.push({
    x: last.x + (last.x - previous.x) / length * overshoot,
    y: last.y + (last.y - previous.y) / length * overshoot,
    isCorner: false,
  });
  return samples;
}

function pressuresFor(samples: ReadonlyArray<Sample>, random: () => number): number[] {
  const slowPhase = random() * DOUBLE * Math.PI;
  const fastPhase = random() * DOUBLE * Math.PI;
  return samples.map((_, index) => {
    const slow = SLOW_WEIGHT * Math.sin(slowPhase + DOUBLE * Math.PI * index / PRESSURE_SLOW_POINTS);
    const fast = FAST_WEIGHT * Math.sin(fastPhase + DOUBLE * Math.PI * index / PRESSURE_FAST_POINTS);
    const width = Math.max(PRESSURE_MIN, Math.min(PRESSURE_MAX, 1 + PRESSURE_VARIATION * (slow + fast)));
    return index === samples.length - 1 ? width * PRESSURE_LIFT_OFF : width;
  });
}

function timedPath(samples: ReadonlyArray<Sample>, widths: ReadonlyArray<number>, random: () => number): InkPoint[] {
  const speedPhase = random() * DOUBLE * Math.PI;
  const path: InkPoint[] = [{ x: samples[0].x, y: samples[0].y, width: widths[0], time: 0 }];
  let time = 0;
  for (let i = 1; i < samples.length; i++) {
    const sample = samples[i];
    const previous = samples[i - 1];
    const speed = 1 + SPEED_VARIATION * Math.sin(speedPhase + DOUBLE * Math.PI * i / SPEED_WAVE_POINTS);
    time += Math.hypot(sample.x - previous.x, sample.y - previous.y) * SECONDS_PER_UNIT / speed;
    const point = { x: sample.x, y: sample.y, width: widths[i], time };
    path.push(point);
    if (sample.isCorner && i < samples.length - DOUBLE) {
      time += CORNER_DWELL_MIN + random() * (CORNER_DWELL_MAX - CORNER_DWELL_MIN);
      path.push({ ...point, time });
    }
  }
  return path;
}

export function buildInkPath(points: ReadonlyArray<Point>, random: () => number): ReadonlyArray<InkPoint> {
  if (points.length === 1) return [{ ...points[0], width: 1, time: 0 }];
  const samples = samplesFor(verticesFor(points, random), random);
  return timedPath(samples, pressuresFor(samples, random), random);
}
