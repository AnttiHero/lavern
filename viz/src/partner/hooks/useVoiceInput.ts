/**
 * useVoiceInput — Voice-to-text input hook.
 *
 * Primary:  Deepgram Flux via backend WebSocket proxy (/api/voice/stt)
 * Fallback: Browser Web Speech API (SpeechRecognition)
 *
 * Provides a unified interface regardless of backend:
 * - isListening, interimTranscript, finalTranscript, audioLevel
 * - startListening(), stopListening(), clearTranscript()
 */

import { useState, useRef, useCallback, useEffect } from 'react';

export interface UseVoiceInputReturn {
  isListening: boolean;
  isSupported: boolean;
  interimTranscript: string;
  finalTranscript: string;
  audioLevel: number;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  clearTranscript: () => void;
}

// Check browser support
const hasGetUserMedia = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
const SpeechRecognitionAPI =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

export function useVoiceInput(): UseVoiceInputReturn {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSupported] = useState(hasGetUserMedia || !!SpeechRecognitionAPI);

  // Refs for cleanup
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const recognitionRef = useRef<any>(null);
  const usingFallbackRef = useRef(false);
  const finalAccumRef = useRef('');

  // Audio level metering via AnalyserNode
  const startLevelMeter = useCallback((stream: MediaStream) => {
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser);

      audioCtxRef.current = ctx;
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteFrequencyData(data);
        // Compute RMS normalized to 0-1
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length) / 255;
        // Apply slight curve for more visual response
        setAudioLevel(Math.min(1, rms * 2.5));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      // AudioContext not available — just skip level metering
    }
  }, []);

  const stopLevelMeter = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  // ── Deepgram mode ──────────────────────────────────────────────────

  const startDeepgram = useCallback(async () => {
    setError(null);
    finalAccumRef.current = '';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Start level meter
      startLevelMeter(stream);

      // Determine codec
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      // Open WebSocket to backend STT proxy
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/api/voice/stt`);
      wsRef.current = ws;

      ws.onopen = () => {
        // Start recording with 250ms timeslice
        recorder.start(250);
        setIsListening(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'interim') {
            setInterimTranscript(msg.transcript);
          } else if (msg.type === 'final') {
            finalAccumRef.current += (finalAccumRef.current ? ' ' : '') + msg.transcript;
            setFinalTranscript(finalAccumRef.current);
            setInterimTranscript('');
          } else if (msg.type === 'error') {
            // STT not configured — fall back to Web Speech API
            if (msg.message === 'STT not configured') {
              ws.close();
              recorder.stop();
              stream.getTracks().forEach(t => t.stop());
              stopLevelMeter();
              usingFallbackRef.current = true;
              startWebSpeech();
              return;
            }
            setError(msg.message);
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onerror = () => {
        // Connection failed — clean up Deepgram resources, then fall back
        if (recorder.state !== 'inactive') recorder.stop();
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        mediaRecorderRef.current = null;
        wsRef.current = null;
        stopLevelMeter();
        usingFallbackRef.current = true;
        startWebSpeech();
      };

      ws.onclose = (event) => {
        if (event.code === 4001) {
          // Not configured — clean up Deepgram resources, then fall back
          if (recorder.state !== 'inactive') recorder.stop();
          stream.getTracks().forEach(t => t.stop());
          streamRef.current = null;
          mediaRecorderRef.current = null;
          wsRef.current = null;
          stopLevelMeter();
          usingFallbackRef.current = true;
          startWebSpeech();
        }
      };

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
          ws.send(e.data);
        }
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Microphone access denied';
      setError(msg);
      setIsListening(false);
    }
  }, [startLevelMeter, stopLevelMeter]);

  // ── Web Speech API fallback ────────────────────────────────────────

  const startWebSpeech = useCallback(() => {
    if (!SpeechRecognitionAPI) {
      setError('Speech recognition not supported in this browser');
      return;
    }

    setError(null);
    finalAccumRef.current = '';

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result[0]) continue;
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      if (final) {
        finalAccumRef.current = final;
        setFinalTranscript(final);
      }
      setInterimTranscript(interim);

      // Fake audio level from transcript activity
      if (interim) {
        setAudioLevel(0.4 + Math.random() * 0.3);
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error !== 'aborted') {
        setError(`Speech recognition error: ${event.error}`);
      }
      setIsListening(false);
      setAudioLevel(0);
    };

    recognition.onend = () => {
      setIsListening(false);
      setAudioLevel(0);
    };

    try {
      recognition.start();
    } catch {
      setError('Failed to start speech recognition');
    }
  }, []);

  // ── Public API ─────────────────────────────────────────────────────

  const startListening = useCallback(() => {
    if (isListening) return;
    setInterimTranscript('');
    setFinalTranscript('');

    if (usingFallbackRef.current || !hasGetUserMedia) {
      startWebSpeech();
    } else {
      startDeepgram();
    }
  }, [isListening, startDeepgram, startWebSpeech]);

  const stopListening = useCallback(() => {
    // Stop MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    // Stop media stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    // Close WebSocket (send empty buffer = Deepgram EOF)
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(new ArrayBuffer(0));
      wsRef.current.close();
      wsRef.current = null;
    }

    // Stop Web Speech API
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* already stopped */ }
      recognitionRef.current = null;
    }

    stopLevelMeter();
    setIsListening(false);
  }, [stopLevelMeter]);

  const clearTranscript = useCallback(() => {
    setInterimTranscript('');
    setFinalTranscript('');
    finalAccumRef.current = '';
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* */ }
      }
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {});
    };
  }, []);

  return {
    isListening,
    isSupported,
    interimTranscript,
    finalTranscript,
    audioLevel,
    error,
    startListening,
    stopListening,
    clearTranscript,
  };
}
