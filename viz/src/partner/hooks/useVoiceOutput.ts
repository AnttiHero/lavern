/**
 * useVoiceOutput — Text-to-speech playback hook.
 *
 * Primary:  ElevenLabs via backend proxy (POST /api/voice/tts)
 * Fallback: Browser SpeechSynthesis API
 *
 * Provides: speak(text), stop(), isSpeaking, isEnabled toggle.
 */

import { useState, useRef, useCallback, useEffect } from 'react';

export interface UseVoiceOutputReturn {
  isSpeaking: boolean;
  isLoading: boolean;
  isEnabled: boolean;
  setEnabled: (v: boolean) => void;
  speak: (text: string) => void;
  stop: () => void;
}

const STORAGE_KEY = 'lavern-voice-output-enabled';

function getStoredEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function useVoiceOutput(): UseVoiceOutputReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isEnabled, setIsEnabledState] = useState(getStoredEnabled);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const usingFallbackRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const setEnabled = useCallback((v: boolean) => {
    setIsEnabledState(v);
    try { localStorage.setItem(STORAGE_KEY, v ? 'true' : 'false'); } catch { /* */ }
    // Stop any current speech when disabling
    if (!v) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      setIsSpeaking(false);
      setIsLoading(false);
    }
  }, []);

  // ── ElevenLabs TTS ─────────────────────────────────────────────────

  const speakElevenLabs = useCallback(async (text: string) => {
    setIsLoading(true);

    // Abort previous request if still pending
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });

      if (res.status === 503) {
        // TTS not configured — fall back to browser SpeechSynthesis
        usingFallbackRef.current = true;
        setIsLoading(false);
        speakBrowser(text);
        return;
      }

      if (!res.ok) {
        setIsLoading(false);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      // Clean up previous
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onplay = () => {
        setIsLoading(false);
        setIsSpeaking(true);
      };

      audio.onended = () => {
        setIsSpeaking(false);
        if (urlRef.current) {
          URL.revokeObjectURL(urlRef.current);
          urlRef.current = null;
        }
      };

      audio.onerror = () => {
        setIsLoading(false);
        setIsSpeaking(false);
      };

      await audio.play();
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setIsLoading(false);
      // Fall back to browser TTS
      usingFallbackRef.current = true;
      speakBrowser(text);
    }
  }, []);

  // ── Browser SpeechSynthesis fallback ───────────────────────────────

  const speakBrowser = useCallback((text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;

    // Try to find a good female voice
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v =>
      v.name.includes('Samantha') || // macOS
      v.name.includes('Karen') ||    // macOS
      v.name.includes('Victoria') || // macOS
      v.name.includes('Zira') ||     // Windows
      (v.lang.startsWith('en') && v.name.toLowerCase().includes('female'))
    );
    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }, []);

  // ── Public API ─────────────────────────────────────────────────────

  const speak = useCallback((text: string) => {
    if (!isEnabled || !text) return;

    // Stop any current speech first
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    if (usingFallbackRef.current) {
      speakBrowser(text);
    } else {
      speakElevenLabs(text);
    }
  }, [isEnabled, speakElevenLabs, speakBrowser]);

  const stop = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setIsLoading(false);
  }, []);

  // Load voices (needed for some browsers)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.getVoices(); // Trigger lazy load
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (audioRef.current) audioRef.current.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return {
    isSpeaking,
    isLoading,
    isEnabled,
    setEnabled,
    speak,
    stop,
  };
}
