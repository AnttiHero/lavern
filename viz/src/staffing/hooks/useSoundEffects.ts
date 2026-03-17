/**
 * useSoundEffects — Optional UI sound feedback.
 * Sounds are loaded lazily. Toggle stored in localStorage.
 * Uses Web Audio API for low-latency playback.
 */

import { useState, useCallback, useRef } from 'react';

type SoundName = 'select' | 'deselect' | 'flip' | 'confirm' | 'preset';

// Simple synthesized sounds using Web Audio API — no external files needed
function createAudioContext(): AudioContext | null {
  try {
    return new AudioContext();
  } catch {
    return null;
  }
}

function playTone(ctx: AudioContext, frequency: number, duration: number, volume = 0.1) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = frequency;
  osc.type = 'sine';
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

const soundDefs: Record<SoundName, { freq: number; dur: number; vol?: number }> = {
  select: { freq: 880, dur: 0.08, vol: 0.08 },
  deselect: { freq: 440, dur: 0.06, vol: 0.06 },
  flip: { freq: 660, dur: 0.05, vol: 0.05 },
  confirm: { freq: 1200, dur: 0.15, vol: 0.1 },
  preset: { freq: 720, dur: 0.1, vol: 0.07 },
};

export function useSoundEffects() {
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem('shem-sounds') !== 'off';
    } catch {
      return true;
    }
  });
  const ctxRef = useRef<AudioContext | null>(null);

  const toggle = useCallback(() => {
    setEnabled(prev => {
      const next = !prev;
      try {
        localStorage.setItem('shem-sounds', next ? 'on' : 'off');
      } catch { /* ignore */ }
      return next;
    });
  }, []);

  const play = useCallback((sound: SoundName) => {
    if (!enabled) return;
    if (!ctxRef.current) {
      ctxRef.current = createAudioContext();
    }
    const ctx = ctxRef.current;
    if (!ctx) return;
    // Resume if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') ctx.resume();
    const def = soundDefs[sound];
    if (!def) return;
    playTone(ctx, def.freq, def.dur, def.vol);
  }, [enabled]);

  return { enabled, toggle, play };
}
