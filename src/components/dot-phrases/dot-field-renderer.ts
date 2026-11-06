import gsap from "gsap";
import { dotRadius, inkWidth, labelFontSize } from "@/lib/dot-phrases/sizing";
import type {
  DotScene,
  InkPoint,
  PhraseDot,
  Point,
  ScenePhrase,
  Size,
} from "@/lib/dot-phrases/types";

export type DotBlink = { readonly index: number; readonly startedAt: number };

export type DotFieldState = {
  phraseIndex: number; // which phrase of the scene is shown
  appear: number; // 0..1, the hexagon dots fade in from the center outward (first cycle only)
  spread: number; // 0 = every dot in the hexagon, 1 = every dot at its phrase position
  pulse: number; // 0..1, landing pulse of the hexagon
  labels: number; // 0..1, number labels opacity
  ink: number; // seconds of ink drawn, compared with InkStroke.start and end
  inkAlpha: number; // 0..1, ink opacity
  blinks: DotBlink[]; // dots that are blinking, index into the current phrase
};

export type DotFieldStyle = {
  dotColor: string;
  inkColor: string;
  fontFamily: string;
  haloColor: string;
};

const STAGGER = 0.5;
const APPEAR_SPAN = 0.6;
const PULSE_SCALE = 0.06;
const MOVE_EASE = "power3.inOut";
const INK_DAB_RATIO = 1.1;
const PENCIL_ALPHA = 0.9;
const PENCIL_ALPHA_MIN = 0.55;
const PENCIL_WIDTH_SWING = 0.25;
const LABEL_HALO_WIDTH = 3;
const LABEL_FONT_WEIGHT = 500;
const LABEL_ALPHA = 0.85;
const FULL_CIRCLE = Math.PI * 2;
const ZERO_DISTANCE_FALLBACK = 1;
export const BLINK_MS = 900;
const BLINK_GROW = 0.8;
const BLINK_DIP = 0.6;
const BLINK_RING_WIDTH = 1.2;
const BLINK_RING_ALPHA = 0.35;
const BLINK_RING_START = 1.5;
const BLINK_RING_GROWTH = 3;
const MIN_PROGRESS = 0;
const MAX_PROGRESS = 1;
const NO_DOT = -1;

const moveEase = gsap.parseEase(MOVE_EASE);

type RenderedDot = {
  position: Point;
  alpha: number;
  dot: PhraseDot;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function computeDot(
  scene: DotScene,
  phrase: ScenePhrase,
  state: DotFieldState,
  pulseScale: number,
  index: number,
): RenderedDot {
  const slot = scene.slots[phrase.slotIndexByDot[index]];
  const dot = phrase.layout.dots[index];
  const startX = scene.center.x + slot.offset.x * pulseScale;
  const startY = scene.center.y + slot.offset.y * pulseScale;
  const dx = dot.position.x - startX;
  const dy = dot.position.y - startY;
  const distance = Math.hypot(dx, dy);
  const length = distance === 0 ? ZERO_DISTANCE_FALLBACK : distance;
  const local = clamp(state.spread * (1 + STAGGER) - phrase.delays[index] * STAGGER, 0, 1);
  const p = moveEase(local);
  const arc = phrase.curls[index] * Math.sin(Math.PI * p);
  const position = {
    x: startX + dx * p + (-dy / length) * arc,
    y: startY + dy * p + (dx / length) * arc,
  };
  const ringRatio = scene.rings === 0 ? 0 : slot.ring / scene.rings;
  const alpha = clamp(state.appear * (1 + APPEAR_SPAN) - ringRatio * APPEAR_SPAN, 0, 1);
  return { position, alpha, dot };
}

function drawInkStroke(
  ctx: CanvasRenderingContext2D,
  path: ReadonlyArray<InkPoint>,
  elapsed: number,
  baseWidth: number,
  baseAlpha: number,
): void {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (elapsed <= a.time) return;
    const ratio = b.time > a.time ? clamp((elapsed - a.time) / (b.time - a.time), 0, 1) : 1;
    const endX = a.x + (b.x - a.x) * ratio;
    const endY = a.y + (b.y - a.y) * ratio;
    const widthEnd = a.width + (b.width - a.width) * ratio;
    const pressure = (a.width + widthEnd) / 2;
    ctx.globalAlpha = baseAlpha * clamp(PENCIL_ALPHA * pressure, PENCIL_ALPHA_MIN, 1);
    ctx.lineWidth = baseWidth * (1 + PENCIL_WIDTH_SWING * (pressure - 1));
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    if (ratio < 1) return;
  }
}

function drawInk(
  ctx: CanvasRenderingContext2D,
  phrase: ScenePhrase,
  state: DotFieldState,
  style: DotFieldStyle,
  size: Size,
): void {
  if (state.inkAlpha <= 0 || state.ink <= 0) return;
  const baseWidth = inkWidth(size);
  ctx.strokeStyle = style.inkColor;
  // Round caps would stack the transparency at every joint.
  ctx.lineCap = "butt";
  ctx.lineJoin = "round";
  for (const stroke of phrase.layout.strokes) {
    const elapsed = state.ink - stroke.start;
    if (elapsed <= 0) continue;
    if (stroke.path.length === 1) {
      const point = stroke.path[0];
      ctx.fillStyle = style.inkColor;
      ctx.globalAlpha = state.inkAlpha * clamp(PENCIL_ALPHA * point.width, PENCIL_ALPHA_MIN, 1);
      ctx.beginPath();
      ctx.arc(point.x, point.y, baseWidth * INK_DAB_RATIO * point.width, 0, FULL_CIRCLE);
      ctx.fill();
    } else {
      drawInkStroke(ctx, stroke.path, elapsed, baseWidth, state.inkAlpha);
    }
  }
}

function drawDots(
  ctx: CanvasRenderingContext2D,
  rendered: ReadonlyArray<RenderedDot>,
  style: DotFieldStyle,
  size: Size,
  blinks: Map<number, number>,
): void {
  const radius = dotRadius(size);
  ctx.fillStyle = style.dotColor;
  for (const [index, { position, alpha }] of rendered.entries()) {
    if (alpha <= 0) continue;
    const t = blinks.get(index);
    const eased = t === undefined ? MIN_PROGRESS : Math.sin(Math.PI * t);
    ctx.globalAlpha = alpha * (MAX_PROGRESS - BLINK_DIP * eased);
    ctx.beginPath();
    ctx.arc(position.x, position.y, radius * (MAX_PROGRESS + BLINK_GROW * eased), MIN_PROGRESS, FULL_CIRCLE);
    ctx.fill();
    if (t === undefined) continue;
    ctx.strokeStyle = style.dotColor;
    ctx.lineWidth = BLINK_RING_WIDTH;
    ctx.globalAlpha = BLINK_RING_ALPHA * (MAX_PROGRESS - t) * alpha;
    ctx.beginPath();
    ctx.arc(position.x, position.y, radius * (BLINK_RING_START + BLINK_RING_GROWTH * t), MIN_PROGRESS, FULL_CIRCLE);
    ctx.stroke();
  }
}

function drawLabels(
  ctx: CanvasRenderingContext2D,
  rendered: ReadonlyArray<RenderedDot>,
  state: DotFieldState,
  style: DotFieldStyle,
  size: Size,
): void {
  if (state.labels <= 0) return;
  const fontSize = labelFontSize(size);
  ctx.font = `${LABEL_FONT_WEIGHT} ${fontSize}px ${style.fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = style.dotColor;
  ctx.strokeStyle = style.haloColor;
  ctx.lineWidth = LABEL_HALO_WIDTH;
  ctx.lineJoin = "round";
  ctx.globalAlpha = state.labels * LABEL_ALPHA;
  for (const { position, dot } of rendered) {
    const x = position.x + dot.labelOffset.x;
    const y = position.y + dot.labelOffset.y;
    ctx.strokeText(dot.label, x, y);
    ctx.fillText(dot.label, x, y);
  }
}

export function drawDotField(
  ctx: CanvasRenderingContext2D,
  scene: DotScene,
  state: DotFieldState,
  style: DotFieldStyle,
  now: number,
): void {
  const { width, height } = scene.size;
  ctx.clearRect(0, 0, width, height);
  const phrase = scene.phrases[state.phraseIndex];
  if (!phrase) return;

  const pulseScale = 1 + PULSE_SCALE * Math.sin(Math.PI * state.pulse);
  const rendered = phrase.layout.dots.map((_, index) =>
    computeDot(scene, phrase, state, pulseScale, index),
  );

  drawInk(ctx, phrase, state, style, scene.size);
  const blinks = new Map<number, number>();
  for (const blink of state.blinks) {
    const t = (now - blink.startedAt) / BLINK_MS;
    if (t >= MIN_PROGRESS && t < MAX_PROGRESS) blinks.set(blink.index, t);
  }
  drawDots(ctx, rendered, style, scene.size, blinks);
  drawLabels(ctx, rendered, state, style, scene.size);
}

export function findDotNear(
  scene: DotScene,
  state: DotFieldState,
  point: Point,
  maxDistance: number,
): number {
  const phrase = scene.phrases[state.phraseIndex];
  if (!phrase) return NO_DOT;
  const pulseScale = MAX_PROGRESS + PULSE_SCALE * Math.sin(Math.PI * state.pulse);
  let nearest = NO_DOT;
  let distance = maxDistance;
  phrase.layout.dots.forEach((_, index) => {
    const dot = computeDot(scene, phrase, state, pulseScale, index);
    if (dot.alpha <= MIN_PROGRESS) return;
    const current = Math.hypot(dot.position.x - point.x, dot.position.y - point.y);
    if (current <= distance) {
      distance = current;
      nearest = index;
    }
  });
  return nearest;
}
