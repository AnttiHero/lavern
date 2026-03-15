/**
 * VoiceOrb -- The primary interaction element for voice-first Partner view.
 *
 * A large dark circle with gold accents that serves as both the visual
 * presence of Catherine and the push-to-talk button. Always visible,
 * with distinct states: idle, listening, speaking, streaming, disabled.
 */

const GOLD = '#96875f';
const GOLD_RGB = '150, 135, 95';

interface Props {
  audioLevel: number;      // 0-1, from useVoiceInput
  isListening: boolean;    // user is speaking
  isSpeaking: boolean;     // Catherine is speaking (TTS)
  isStreaming: boolean;     // waiting for response
  disabled: boolean;       // during finalization
  onMouseDown: () => void;
  onMouseUp: () => void;
  onTouchStart: () => void;
  onTouchEnd: () => void;
}

export function VoiceOrb({
  audioLevel,
  isListening,
  isSpeaking,
  isStreaming,
  disabled,
  onMouseDown,
  onMouseUp,
  onTouchStart,
  onTouchEnd,
}: Props) {
  const size = disabled ? 0 : 140;

  // Listening: audio-reactive scale and glow
  const listeningScale = 1 + audioLevel * 0.15;
  const listeningGlow = 12 + audioLevel * 32;
  const listeningGlowOpacity = 0.1 + audioLevel * 0.3;

  // Determine animation
  let animation = 'partnerOrbBreath 4s ease-in-out infinite';
  let transform = `scale(1)`;
  let boxShadow = `0 0 20px rgba(${GOLD_RGB}, 0.08)`;
  let borderColor = `rgba(${GOLD_RGB}, 0.15)`;
  let opacity = 1;

  if (disabled) {
    animation = 'none';
    opacity = 0;
    borderColor = 'transparent';
    boxShadow = 'none';
  } else if (isListening) {
    animation = 'none';
    transform = `scale(${listeningScale})`;
    boxShadow = `0 0 ${listeningGlow}px rgba(${GOLD_RGB}, ${listeningGlowOpacity})`;
    borderColor = `rgba(${GOLD_RGB}, 0.5)`;
  } else if (isSpeaking) {
    animation = 'partnerOrbSpeaking 2s ease-in-out infinite';
    borderColor = `rgba(${GOLD_RGB}, 0.35)`;
  } else if (isStreaming) {
    opacity = 0.6;
    animation = 'partnerOrbBreath 2s ease-in-out infinite';
  }

  // Label for accessibility
  let ariaLabel = 'Hold to speak';
  if (isListening) ariaLabel = 'Listening... release to send';
  if (isSpeaking) ariaLabel = 'Catherine is speaking';
  if (isStreaming) ariaLabel = 'Catherine is thinking';
  if (disabled) ariaLabel = 'Voice input disabled';

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onMouseDown={disabled ? undefined : onMouseDown}
      onMouseUp={disabled ? undefined : onMouseUp}
      onTouchStart={disabled ? undefined : onTouchStart}
      onTouchEnd={disabled ? undefined : onTouchEnd}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: '#2a2a2a',
        border: `1.5px solid ${borderColor}`,
        boxShadow,
        transform,
        animation,
        opacity,
        cursor: disabled ? 'default' : 'pointer',
        transition: 'width 0.4s ease, height 0.4s ease, opacity 0.4s ease, transform 100ms ease-out, box-shadow 100ms ease-out, border-color 200ms ease',
        outline: 'none',
        padding: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      {/* Inner ring -- subtle gold accent */}
      <div
        style={{
          width: size * 0.55,
          height: size * 0.55,
          borderRadius: '50%',
          border: `1px solid rgba(${GOLD_RGB}, ${isListening ? 0.3 + audioLevel * 0.3 : isSpeaking ? 0.2 : 0.08})`,
          transition: 'border-color 100ms ease-out, width 0.4s ease, height 0.4s ease',
          pointerEvents: 'none',
        }}
      />

      {/* Streaming dots */}
      {isStreaming && !isSpeaking && (
        <div style={{ position: 'absolute', display: 'flex', gap: 6 }}>
          {[0, 1, 2].map(i => (
            <div
              key={i}
              style={{
                width: 4,
                height: 4,
                borderRadius: '50%',
                backgroundColor: GOLD,
                opacity: 0.5,
                animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
      )}
    </button>
  );
}
