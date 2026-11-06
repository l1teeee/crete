import type { DotScene, Point } from "@/lib/dot-phrases/types";
import { BLINK_MS, findDotNear, type DotFieldState } from "./dot-field-renderer";
import type { SoundCues } from "./sound-engine";

export type DotHover = {
  handlePointer(point: Point, now: number): void;
  reset(): void;
  release(): void;
};

const HOVER_RADIUS = 18;
const HOVER_COOLDOWN_MS = 90;
const PAN_RANGE = 0.8;
const PAN_SCALE = 2;
const PAN_OFFSET = 1;
const NO_DOT = -1;
const EMPTY_LENGTH = 0;

export function createDotHover(options: {
  getScene: () => DotScene | null;
  state: DotFieldState;
  cues: SoundCues;
  blinkEnabled: () => boolean;
}): DotHover {
  const { getScene, state, cues, blinkEnabled } = options;
  let hovered = NO_DOT;
  let lastTrigger = -Infinity;

  function handlePointer(point: Point, now: number): void {
    const scene = getScene();
    if (!scene) return;
    const index = findDotNear(scene, state, point, HOVER_RADIUS);
    if (index === NO_DOT) {
      hovered = NO_DOT;
      return;
    }
    if (index === hovered) return;
    hovered = index;
    if (now - lastTrigger < HOVER_COOLDOWN_MS) return;
    lastTrigger = now;
    if (blinkEnabled()) {
      for (let i = state.blinks.length - PAN_OFFSET; i >= EMPTY_LENGTH; i--) {
        if (now - state.blinks[i].startedAt >= BLINK_MS) state.blinks.splice(i, PAN_OFFSET);
      }
      state.blinks.push({ index, startedAt: now });
    }
    const pan = (point.x / scene.size.width * PAN_SCALE - PAN_OFFSET) * PAN_RANGE;
    cues.hover(index, pan);
  }

  function release(): void {
    hovered = NO_DOT;
  }

  function reset(): void {
    release();
    state.blinks.length = EMPTY_LENGTH;
  }

  return { handlePointer, reset, release };
}
