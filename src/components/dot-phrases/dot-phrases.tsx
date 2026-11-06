"use client";

import { useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { PHRASES } from "@/lib/dot-phrases/phrases";
import { planPhrases } from "@/lib/dot-phrases/phrase-plan";
import { buildScene } from "@/lib/dot-phrases/scene";
import type { DotScene } from "@/lib/dot-phrases/types";
import { drawDotField, type DotFieldState } from "./dot-field-renderer";
import { createDotHover } from "./dot-hover";
import { createDotTimeline, createStaticSequence } from "./dot-timeline";
import { createSoundEngine, type SoundEngine } from "./sound-engine";
import { SoundToggle } from "./sound-toggle";

gsap.registerPlugin(useGSAP);

const INK_COLOR = "#c4573f";
const MAX_DPR = 2;
const DEFAULT_DPR = 1;
const UNLOCK_EVENTS = ["pointerdown", "pointerup", "keydown", "touchend"];

export function DotPhrases() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<SoundEngine | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const soundOnRef = useRef(true);
  const [phraseText, setPhraseText] = useState("");

  useGSAP(
    () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D is not available");

      const planned = planPhrases(PHRASES);
      const computed = getComputedStyle(canvas);
      const style = {
        dotColor: computed.color,
        inkColor: INK_COLOR,
        fontFamily: computed.fontFamily,
        haloColor: getComputedStyle(document.body).backgroundColor,
      };
      const state: DotFieldState = {
        phraseIndex: 0,
        appear: 0,
        spread: 0,
        pulse: 0,
        labels: 0,
        ink: 0,
        inkAlpha: 1,
        blinks: [],
      };

      let scene: DotScene | null = null;
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const width = Math.round(entry.contentRect.width);
        const height = Math.round(entry.contentRect.height);
        if (width <= 0 || height <= 0) return;
        const dpr = Math.min(window.devicePixelRatio || DEFAULT_DPR, MAX_DPR);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        scene = buildScene(planned, { width, height });
      });
      observer.observe(container);

      const render = () => {
        if (scene) drawDotField(ctx, scene, state, style, performance.now());
      };
      gsap.ticker.add(render);

      const engine = createSoundEngine();
      engineRef.current = engine;
      const hover = createDotHover({
        getScene: () => scene,
        state,
        cues: engine.cues,
        blinkEnabled: () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      });
      const handlePointer = (event: PointerEvent) => {
        const rect = container.getBoundingClientRect();
        hover.handlePointer({ x: event.clientX - rect.left, y: event.clientY - rect.top }, performance.now());
      };
      container.addEventListener("pointermove", handlePointer);
      container.addEventListener("pointerdown", handlePointer);
      container.addEventListener("pointerleave", hover.release);
      let unlocked = false;
      const removeUnlockListeners = () => {
        for (const event of UNLOCK_EVENTS) window.removeEventListener(event, unlock, true);
      };
      const onUnlocked = () => {
        unlocked = true;
        removeUnlockListeners();
      };
      function unlock(event: Event): void {
        if (unlocked || !soundOnRef.current) return;
        if (event.target instanceof Element && event.target.closest("button")) return;
        void engine.enable().then(onUnlocked, (error) => {
          onUnlocked();
          throw error;
        });
      }
      for (const event of UNLOCK_EVENTS) window.addEventListener(event, unlock, true);
      const handleVisibilityChange = () => {
        engine.setPaused(document.hidden);
      };
      document.addEventListener("visibilitychange", handleVisibilityChange);

      const onPhrase = (index: number) => {
        hover.reset();
        setPhraseText(PHRASES[index].join(" "));
      };
      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        const timeline = createDotTimeline({ state, planned, cues: engine.cues, onPhrase });
        return () => {
          timeline.kill();
        };
      });
      media.add("(prefers-reduced-motion: reduce)", () => {
        const timeline = createStaticSequence({ state, planned, onPhrase });
        return () => {
          timeline.kill();
        };
      });

      return () => {
        media.revert();
        gsap.ticker.remove(render);
        observer.disconnect();
        container.removeEventListener("pointermove", handlePointer);
        container.removeEventListener("pointerdown", handlePointer);
        container.removeEventListener("pointerleave", hover.release);
        removeUnlockListeners();
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        engine.dispose();
        engineRef.current = null;
      };
    },
    { scope: containerRef },
  );

  function handleToggle(): void {
    const engine = engineRef.current;
    if (!engine) return;
    if (soundOn) {
      soundOnRef.current = false;
      engine.disable();
      setSoundOn(false);
    } else {
      soundOnRef.current = true;
      void engine.enable().then(() => setSoundOn(true));
    }
  }

  return (
    <div ref={containerRef} className="fixed inset-0 overflow-hidden">
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 size-full" />
      <p className="sr-only" aria-live="polite">
        {phraseText}
      </p>
      <SoundToggle enabled={soundOn} onToggle={handleToggle} />
    </div>
  );
}
