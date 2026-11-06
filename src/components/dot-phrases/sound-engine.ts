export type SoundCues = {
  stroke(index: number): void; // a stroke starts; index counts strokes of the phrase from 0
  hover(index: number, pan: number): void; // the pointer touched dot index; pan in [-1, 1] follows the pointer x
};

export type SoundEngine = {
  readonly cues: SoundCues;
  enable(): Promise<void>; // must be called synchronously from a click handler
  disable(): void;
  setPaused(paused: boolean): void; // true while the tab is hidden
  dispose(): void;
};

const MASTER_ON_LEVEL = 0.9;
const MASTER_FADE_IN_SECONDS = 0.8;
const MASTER_FADE_OUT_SECONDS = 0.4;
const SUSPEND_DELAY_MS = 450;

const LIMITER = { threshold: -18, knee: 24, ratio: 4, attack: 0.01, release: 0.25 };

const ECHO_INPUT_GAIN = 1;
const ECHO_DELAY_SECONDS = 0.32;
const ECHO_FILTER_HZ = 2200;
const ECHO_FEEDBACK_GAIN = 0.28;

const SILENCE = 0.0001;
const TONE_STOP_MARGIN_SECONDS = 0.05;

const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];
const PING_PONG_PERIOD = 14;
const PAN_STEPS = 5;
const PAN_CENTER_STEP = 2;
const PAN_SPREAD = 0.15;
const STROKE_SEND = 0.3;
const STROKE_NOTE = { attack: 0.005, decay: 0.45, peak: 0.07 };
const STROKE_OCTAVE = { attack: 0.005, decay: 0.25, peak: 0.018 };
const OCTAVE_FACTOR = 2;
const HOVER_NOTES = [659.25, 783.99, 880, 1046.5, 1174.66];
const HOVER_NOTE = { attack: 0.01, decay: 0.5, peak: 0.045, send: 0.35 };

type ToneSpec = {
  frequency: number;
  attack: number;
  decay: number;
  peak: number;
  send: number;
  pan?: number;
};

type Graph = {
  context: AudioContext;
  master: GainNode;
  limiter: DynamicsCompressorNode;
  echoIn: GainNode;
};

function createOscillator(
  context: AudioContext,
  frequency: number,
  detune = 0,
): OscillatorNode {
  const osc = context.createOscillator();
  osc.type = "sine";
  osc.frequency.value = frequency;
  osc.detune.value = detune;
  return osc;
}

function createGain(context: AudioContext, value: number): GainNode {
  const gain = context.createGain();
  gain.gain.value = value;
  return gain;
}

function createLimiter(context: AudioContext): DynamicsCompressorNode {
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = LIMITER.threshold;
  limiter.knee.value = LIMITER.knee;
  limiter.ratio.value = LIMITER.ratio;
  limiter.attack.value = LIMITER.attack;
  limiter.release.value = LIMITER.release;
  return limiter;
}

function buildEchoBus(context: AudioContext, master: GainNode): GainNode {
  const echoIn = createGain(context, ECHO_INPUT_GAIN);
  const delay = context.createDelay();
  delay.delayTime.value = ECHO_DELAY_SECONDS;
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = ECHO_FILTER_HZ;
  const feedback = createGain(context, ECHO_FEEDBACK_GAIN);
  echoIn.connect(delay);
  delay.connect(filter);
  filter.connect(master);
  filter.connect(feedback);
  feedback.connect(delay);
  return echoIn;
}

function buildGraph(context: AudioContext): Graph {
  const master = createGain(context, 0);
  const limiter = createLimiter(context);
  master.connect(limiter);
  limiter.connect(context.destination);
  const echoIn = buildEchoBus(context, master);
  return {
    context,
    master,
    limiter,
    echoIn,
  };
}

function rampMaster(graph: Graph, level: number, seconds: number): void {
  const { gain } = graph.master;
  const now = graph.context.currentTime;
  gain.cancelScheduledValues(now);
  gain.setValueAtTime(gain.value, now);
  gain.linearRampToValueAtTime(level, now + seconds);
}

function playTone(graph: Graph, spec: ToneSpec): void {
  const { context } = graph;
  const t = context.currentTime;
  const length = spec.attack + spec.decay;

  const osc = createOscillator(context, spec.frequency);

  const envelope = context.createGain();
  envelope.gain.setValueAtTime(SILENCE, t);
  envelope.gain.linearRampToValueAtTime(spec.peak, t + spec.attack);
  envelope.gain.exponentialRampToValueAtTime(SILENCE, t + length);

  const send = createGain(context, spec.send);
  const nodes: AudioNode[] = [osc, envelope, send];
  osc.connect(envelope);

  if (spec.pan === undefined) {
    envelope.connect(graph.master);
  } else {
    const panner = context.createStereoPanner();
    panner.pan.value = spec.pan;
    envelope.connect(panner);
    panner.connect(graph.master);
    nodes.push(panner);
  }
  envelope.connect(send);
  send.connect(graph.echoIn);

  osc.onended = () => {
    for (const node of nodes) node.disconnect();
  };
  osc.start(t);
  osc.stop(t + length + TONE_STOP_MARGIN_SECONDS);
}

function strokeNoteFrequency(index: number): number {
  const step = index % PING_PONG_PERIOD;
  const noteIndex = step < PENTATONIC.length ? step : PING_PONG_PERIOD - step;
  return PENTATONIC[noteIndex];
}

function playStroke(graph: Graph, index: number): void {
  const frequency = strokeNoteFrequency(index);
  const pan = ((index % PAN_STEPS) - PAN_CENTER_STEP) * PAN_SPREAD;
  playTone(graph, { frequency, send: STROKE_SEND, pan, ...STROKE_NOTE });
  playTone(graph, {
    frequency: frequency * OCTAVE_FACTOR,
    send: STROKE_SEND,
    pan,
    ...STROKE_OCTAVE,
  });
}

function playHover(graph: Graph, index: number, pan: number): void {
  const frequency = HOVER_NOTES[index % HOVER_NOTES.length];
  playTone(graph, { frequency, pan, ...HOVER_NOTE });
}

export function createSoundEngine(): SoundEngine {
  let graph: Graph | null = null;
  let enabled = false;
  let wanted = false;
  let paused = false;
  let suspendTimer: ReturnType<typeof setTimeout> | null = null;

  function clearSuspendTimer(): void {
    if (suspendTimer === null) return;
    clearTimeout(suspendTimer);
    suspendTimer = null;
  }

  function active(): Graph | null {
    return enabled && !paused ? graph : null;
  }

  function cue(play: (g: Graph) => void): void {
    const g = active();
    if (g) play(g);
  }

  async function enable(): Promise<void> {
    wanted = true;
    clearSuspendTimer();
    if (!graph) {
      if (typeof AudioContext === "undefined") {
        throw new Error("Web Audio is not available");
      }
      graph = buildGraph(new AudioContext());
    }
    await graph.context.resume();
    if (!wanted) return;
    enabled = true;
    rampMaster(graph, MASTER_ON_LEVEL, MASTER_FADE_IN_SECONDS);
  }

  function disable(): void {
    wanted = false;
    enabled = false;
    if (!graph) return;
    const { context } = graph;
    rampMaster(graph, 0, MASTER_FADE_OUT_SECONDS);
    clearSuspendTimer();
    suspendTimer = setTimeout(() => {
      suspendTimer = null;
      void context.suspend();
    }, SUSPEND_DELAY_MS);
  }

  function setPaused(value: boolean): void {
    paused = value;
    if (!graph || !enabled) return;
    if (paused) void graph.context.suspend();
    else void graph.context.resume();
  }

  function dispose(): void {
    wanted = false;
    clearSuspendTimer();
    enabled = false;
    if (!graph) return;
    graph.master.disconnect();
    graph.limiter.disconnect();
    graph.echoIn.disconnect();
    void graph.context.close();
    graph = null;
  }

  const cues: SoundCues = {
    stroke: (index) => cue((g) => playStroke(g, index)),
    hover: (index, pan) => cue((g) => playHover(g, index, pan)),
  };

  return { cues, enable, disable, setPaused, dispose };
}
