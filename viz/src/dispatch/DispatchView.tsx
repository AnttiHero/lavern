/**
 * DispatchView — Voice command interface for Claw Mode.
 *
 * "Talk to your law firm."
 *
 * Mobile-optimized, dark background, large microphone button.
 * Tap to speak, Clawern executes the command and speaks the response.
 */

import { colors, fonts, spacing } from '../staffing/styles/tokens.js';
import { useDispatch } from './useDispatch.js';

interface Props {
  onBack: () => void;
}

export default function DispatchView({ onBack }: Props) {
  const {
    isListening,
    isProcessing,
    isSupported,
    transcript,
    lastResult,
    error,
    startListening,
    stopListening,
  } = useDispatch();

  const handleMicClick = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  return (
    <main style={styles.page} aria-label="Voice Dispatch">
      <div style={styles.container}>
        {/* Back button */}
        <button onClick={onBack} style={styles.backBtn} aria-label="Back to dashboard">
          {'<'} Back
        </button>

        {/* Title */}
        <h1 style={styles.title}>Dispatch</h1>
        <p style={styles.subtitle}>Talk to your law firm.</p>

        {/* Microphone */}
        <div style={styles.micArea}>
          {isSupported ? (
            <button
              onClick={handleMicClick}
              disabled={isProcessing}
              style={{
                ...styles.micBtn,
                backgroundColor: isListening ? '#C45D3E' : isProcessing ? '#555' : '#B8860B',
                transform: isListening ? 'scale(1.1)' : 'scale(1)',
                boxShadow: isListening
                  ? '0 0 40px rgba(196, 93, 62, 0.4)'
                  : '0 4px 24px rgba(0,0,0,0.3)',
              }}
              aria-label={isListening ? 'Stop listening' : 'Start listening'}
            >
              <span style={styles.micIcon}>
                {isProcessing ? '...' : isListening ? '||' : '\uD83C\uDF99'}
              </span>
            </button>
          ) : (
            <p style={styles.unsupported}>
              Voice input not supported in this browser. Try Chrome or Safari.
            </p>
          )}

          <p style={styles.micHint}>
            {isProcessing ? 'Processing...'
              : isListening ? 'Listening...'
              : 'Tap to speak'}
          </p>
        </div>

        {/* Transcript */}
        {transcript && (
          <div style={styles.transcriptBox}>
            <span style={styles.transcriptLabel}>You said:</span>
            <span style={styles.transcriptText}>{transcript}</span>
          </div>
        )}

        {/* Response */}
        {lastResult && (
          <div style={{
            ...styles.responseBox,
            borderLeftColor: lastResult.success ? '#B8860B' : '#C45D3E',
          }}>
            <span style={styles.responseText}>{lastResult.text}</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={styles.errorBox}>
            {error}
          </div>
        )}

        {/* Command hints */}
        <div style={styles.hints}>
          <span style={styles.hintsLabel} id="hints-label">Try saying:</span>
          <ul style={styles.hintChips} role="list" aria-labelledby="hints-label">
            {['What\'s the status?', 'Any critical findings?', 'Scan now', 'Pause', 'How much have we spent?'].map(hint => (
              <li key={hint} role="listitem" style={styles.hintChip}>{hint}</li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#080808',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: spacing.lg,
  },
  container: {
    maxWidth: 420,
    width: '100%',
    textAlign: 'center' as const,
  },
  backBtn: {
    position: 'absolute' as const,
    top: 16,
    left: 16,
    padding: '6px 14px',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 6,
    backgroundColor: 'transparent',
    color: 'rgba(255,255,255,0.5)',
    fontFamily: fonts.sans,
    fontSize: 12,
    cursor: 'pointer',
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 32,
    fontWeight: 400,
    fontStyle: 'italic' as const,
    color: '#E8E0D4',
    margin: '60px 0 4px',
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: '0.05em',
    margin: '0 0 48px',
  },
  micArea: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 16,
    marginBottom: 32,
  },
  micBtn: {
    width: 96,
    height: 96,
    borderRadius: '50%',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micIcon: {
    fontSize: 36,
    color: '#fff',
    lineHeight: 1,
  },
  micHint: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
  },
  unsupported: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    maxWidth: 280,
  },
  transcriptBox: {
    padding: '12px 16px',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    marginBottom: 16,
    textAlign: 'left' as const,
  },
  transcriptLabel: {
    display: 'block',
    fontSize: 10,
    fontFamily: fonts.sans,
    color: 'rgba(255,255,255,0.3)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    marginBottom: 4,
  },
  transcriptText: {
    fontSize: 14,
    fontFamily: fonts.sans,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 1.5,
  },
  responseBox: {
    padding: '14px 16px',
    backgroundColor: 'rgba(184, 134, 11, 0.06)',
    borderLeft: '3px solid #B8860B',
    borderRadius: '0 8px 8px 0',
    marginBottom: 16,
    textAlign: 'left' as const,
  },
  responseText: {
    fontSize: 14,
    fontFamily: fonts.sans,
    color: '#E8E0D4',
    lineHeight: 1.6,
  },
  errorBox: {
    padding: '10px 14px',
    backgroundColor: 'rgba(196, 93, 62, 0.08)',
    border: '1px solid rgba(196, 93, 62, 0.2)',
    borderRadius: 8,
    fontSize: 12,
    fontFamily: fonts.sans,
    color: '#C45D3E',
    marginBottom: 16,
    textAlign: 'left' as const,
  },
  hints: {
    marginTop: 32,
  },
  hintsLabel: {
    display: 'block',
    fontSize: 10,
    fontFamily: fonts.sans,
    color: 'rgba(255,255,255,0.25)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    marginBottom: 12,
  },
  hintChips: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    justifyContent: 'center',
    gap: 8,
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  hintChip: {
    padding: '4px 10px',
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.1)',
    fontSize: 11,
    fontFamily: fonts.sans,
    color: 'rgba(255,255,255,0.35)',
  },
};
