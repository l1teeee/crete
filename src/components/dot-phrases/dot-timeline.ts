import gsap from "gsap";
import type { PhrasePlan, PlannedPhrase } from "@/lib/dot-phrases/types";
import type { DotFieldState } from "./dot-field-renderer";
import type { SoundCues } from "./sound-engine";

export type DotTimelineOptions = {
  state: DotFieldState;
  planned: ReadonlyArray<PlannedPhrase>;
  cues: SoundCues;
  onPhrase: (index: number) => void;
};

const APPEAR_SECONDS = 1;
const INTRO_HOLD_SECONDS = 0.5;
const SPREAD_SECONDS = 1.8;
const LABELS_IN_SECONDS = 0.4;
const INK_DELAY_SECONDS = 0.1;
const HOLD_SECONDS = 1.8;
const FADE_SECONDS = 0.5;
const COLLAPSE_SECONDS = 1.5;
const PULSE_SECONDS = 0.5;
const REST_SECONDS = 0.3;
const STATIC_PHRASE_SECONDS = 5;
const INFINITE_REPEAT = -1;
const START_AT_ZERO = 0;

function buildPhraseCycle(
  index: number,
  plan: PhrasePlan,
  options: DotTimelineOptions,
): gsap.core.Timeline {
  const { state, cues, onPhrase } = options;
  const cycle = gsap.timeline();
  const labelsStart = SPREAD_SECONDS - LABELS_IN_SECONDS;
  const inkStart = SPREAD_SECONDS + INK_DELAY_SECONDS;
  const inkEnd = inkStart + plan.inkDuration;
  const fadeStart = inkEnd + HOLD_SECONDS;
  const collapseStart = fadeStart + FADE_SECONDS;
  const collapseEnd = collapseStart + COLLAPSE_SECONDS;
  const pulseEnd = collapseEnd + PULSE_SECONDS;

  cycle.call(
    () => {
      state.phraseIndex = index;
      onPhrase(index);
    },
    [],
    START_AT_ZERO,
  );
  cycle.fromTo(
    state,
    { spread: 0 },
    { spread: 1, duration: SPREAD_SECONDS, ease: "none", immediateRender: false },
    START_AT_ZERO,
  );
  cycle.fromTo(
    state,
    { labels: 0 },
    { labels: 1, duration: LABELS_IN_SECONDS, immediateRender: false },
    labelsStart,
  );
  cycle.fromTo(
    state,
    { ink: 0 },
    { ink: plan.inkDuration, duration: plan.inkDuration, ease: "none", immediateRender: false },
    inkStart,
  );
  plan.strokes.forEach((stroke, strokeIndex) => {
    cycle.call(() => cues.stroke(strokeIndex), [], inkStart + stroke.start);
  });
  cycle.fromTo(
    state,
    { inkAlpha: 1, labels: 1 },
    { inkAlpha: 0, labels: 0, duration: FADE_SECONDS, immediateRender: false },
    fadeStart,
  );
  cycle.fromTo(
    state,
    { spread: 1 },
    { spread: 0, duration: COLLAPSE_SECONDS, ease: "none", immediateRender: false },
    collapseStart,
  );
  cycle.call(
    () => {
      state.ink = 0;
      state.inkAlpha = 1;
    },
    [],
    collapseEnd,
  );
  cycle.fromTo(
    state,
    { pulse: 0 },
    { pulse: 1, duration: PULSE_SECONDS, immediateRender: false },
    collapseEnd,
  );
  cycle.call(
    () => {
      state.pulse = 0;
    },
    [],
    pulseEnd,
  );
  cycle.to({}, { duration: REST_SECONDS }, pulseEnd);

  return cycle;
}

export function createDotTimeline(options: DotTimelineOptions): gsap.core.Timeline {
  const { state, planned } = options;
  const master = gsap.timeline();

  master.fromTo(
    state,
    { appear: 0 },
    { appear: 1, duration: APPEAR_SECONDS, ease: "power1.out", immediateRender: false },
  );
  master.to({}, { duration: INTRO_HOLD_SECONDS });

  const loop = gsap.timeline({ repeat: INFINITE_REPEAT });
  planned.forEach(({ plan }, index) => {
    loop.add(buildPhraseCycle(index, plan, options));
  });
  master.add(loop);

  return master;
}

export function createStaticSequence(
  options: Omit<DotTimelineOptions, "cues">,
): gsap.core.Timeline {
  const { state, planned, onPhrase } = options;
  const timeline = gsap.timeline({ repeat: INFINITE_REPEAT });

  timeline.to({}, { duration: planned.length * STATIC_PHRASE_SECONDS }, START_AT_ZERO);
  planned.forEach(({ plan }, index) => {
    timeline.call(
      () => {
        Object.assign(state, {
          phraseIndex: index,
          appear: 1,
          spread: 1,
          pulse: 0,
          labels: 1,
          ink: plan.inkDuration,
          inkAlpha: 1,
        });
        onPhrase(index);
      },
      [],
      index * STATIC_PHRASE_SECONDS,
    );
  });

  return timeline;
}
