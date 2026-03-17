/**
 * Voice Routes — Deepgram STT proxy + ElevenLabs TTS proxy.
 *
 * Two endpoints:
 * 1. GET  /api/voice/stt  (WebSocket) — proxies audio to Deepgram, returns transcript events
 * 2. POST /api/voice/tts  (HTTP)      — proxies text to ElevenLabs, returns audio/mpeg stream
 *
 * When API keys are not configured, endpoints return appropriate error codes
 * so the frontend can fall back to browser-native Web Speech / SpeechSynthesis.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import WebSocket from 'ws';
import { config } from '../../config.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('voice');

// ── Schemas ──────────────────────────────────────────────────────────────

const TtsBodySchema = z.object({
  text: z.string().min(1).max(5000),
  voiceId: z.string().optional(),
});

// ── Register ─────────────────────────────────────────────────────────────

export function registerVoiceRoutes(fastify: FastifyInstance): void {
  // ── GET /api/voice/stt — Deepgram STT WebSocket proxy ──────────────

  fastify.get('/api/voice/stt', { websocket: true }, (clientSocket, _request) => {
    const apiKey = config.voice.deepgramApiKey;

    if (!apiKey) {
      clientSocket.send(JSON.stringify({ type: 'error', message: 'STT not configured' }));
      clientSocket.close(4001, 'STT not configured');
      return;
    }

    // Build Deepgram WebSocket URL
    const dgUrl = new URL('wss://api.deepgram.com/v1/listen');
    dgUrl.searchParams.set('model', 'nova-2');
    dgUrl.searchParams.set('language', 'en');
    dgUrl.searchParams.set('smart_format', 'true');
    dgUrl.searchParams.set('endpointing', '300');
    dgUrl.searchParams.set('interim_results', 'true');
    dgUrl.searchParams.set('utterance_end_ms', '1500');
    dgUrl.searchParams.set('encoding', 'opus');
    dgUrl.searchParams.set('sample_rate', '48000');

    let dgSocket: WebSocket | null = null;

    try {
      dgSocket = new WebSocket(dgUrl.toString(), {
        headers: { Authorization: `Token ${apiKey}` },
      });
    } catch (err) {
      logger.error('Failed to create Deepgram WebSocket', { error: err });
      clientSocket.send(JSON.stringify({ type: 'error', message: 'Failed to connect to STT service' }));
      clientSocket.close(4002, 'STT connection failed');
      return;
    }

    dgSocket.on('open', () => {
      clientSocket.send(JSON.stringify({ type: 'connected' }));
    });

    dgSocket.on('message', (data: Buffer | string) => {
      try {
        const msg = JSON.parse(data.toString());

        // Deepgram transcript response
        if (msg.type === 'Results') {
          const alt = msg.channel?.alternatives?.[0];
          if (!alt) return;

          const transcript = alt.transcript?.trim();
          if (!transcript) return;

          const isFinal = msg.is_final === true;
          const speechFinal = msg.speech_final === true;

          clientSocket.send(JSON.stringify({
            type: isFinal ? 'final' : 'interim',
            transcript,
            confidence: alt.confidence ?? 0,
            isFinal: speechFinal,
          }));
        }

        // Deepgram utterance end event
        if (msg.type === 'UtteranceEnd') {
          clientSocket.send(JSON.stringify({ type: 'utterance_end' }));
        }
      } catch (parseErr) {
        logger.warn('Failed to parse Deepgram message', { error: (parseErr as Error).message });
      }
    });

    dgSocket.on('error', (err) => {
      logger.error('Deepgram WebSocket error', { error: err });
      clientSocket.send(JSON.stringify({ type: 'error', message: 'STT service error' }));
    });

    dgSocket.on('close', (_code, _reason) => {
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.send(JSON.stringify({ type: 'closed' }));
        clientSocket.close(1000, 'STT session ended');
      }
    });

    // Forward audio from client to Deepgram
    clientSocket.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
      if (dgSocket && dgSocket.readyState === WebSocket.OPEN) {
        dgSocket.send(data as Buffer);
      }
    });

    // Clean up on client disconnect
    clientSocket.on('close', () => {
      if (dgSocket && dgSocket.readyState === WebSocket.OPEN) {
        // Send empty buffer to signal end-of-stream (Deepgram protocol)
        dgSocket.send(Buffer.alloc(0));
        dgSocket.close();
      }
      dgSocket = null;
    });

    clientSocket.on('error', () => {
      if (dgSocket && dgSocket.readyState === WebSocket.OPEN) {
        dgSocket.close();
      }
      dgSocket = null;
    });
  });

  // ── POST /api/voice/tts — ElevenLabs TTS streaming proxy ──────────

  fastify.post('/api/voice/tts', {
    config: {
      rateLimit: {
        max: 30,
        timeWindow: 60_000,
      },
    },
  }, async (request, reply) => {
    const apiKey = config.voice.elevenlabsApiKey;

    if (!apiKey) {
      return reply.status(503).send({ error: 'TTS not configured' });
    }

    // Validate body
    const parsed = TtsBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.issues });
    }

    const { text, voiceId } = parsed.data;
    const voice = voiceId ?? config.voice.elevenlabsVoiceId;
    const model = config.voice.elevenlabsModelId;

    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg',
          },
          body: JSON.stringify({
            text,
            model_id: model,
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
              style: 0.3,
              use_speaker_boost: true,
            },
          }),
        },
      );

      if (!response.ok) {
        const errText = await response.text().catch(() => 'Unknown error');
        logger.error('ElevenLabs TTS error', { status: response.status, body: errText });
        return reply.status(502).send({ error: 'TTS service error' });
      }

      // Ensure we have a readable body before committing to streaming
      const reader = response.body?.getReader();
      if (!reader) {
        return reply.status(502).send({ error: 'No response body from TTS service' });
      }

      // Stream audio back to client
      reply.raw.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        reply.raw.write(value);
      }

      reply.raw.end();
    } catch (err) {
      logger.error('TTS proxy error', { error: err });
      return reply.status(502).send({ error: 'TTS service unavailable' });
    }
  });
}
