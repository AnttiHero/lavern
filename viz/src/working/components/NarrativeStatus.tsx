/**
 * NarrativeStatus — Single line of contextual text with smooth fade transitions.
 *
 * Displays the current narrative message from useNarrativeStatus.
 * When the message changes, fades out old → fades in new (0.5s transition).
 * Fixed-height container prevents layout shifts.
 */

import { useState, useEffect, useRef } from 'react';
import { colors, fonts } from '../../staffing/styles/tokens.js';

interface NarrativeStatusProps {
  message: string;
}

export function NarrativeStatus({ message }: NarrativeStatusProps) {
  const [displayedMessage, setDisplayedMessage] = useState(message);
  const [opacity, setOpacity] = useState(1);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (message === displayedMessage) return;

    // Fade out
    setOpacity(0);

    // After fade-out, swap text and fade in
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setDisplayedMessage(message);
      setOpacity(1);
    }, 400);

    return () => clearTimeout(timeoutRef.current);
  }, [message, displayedMessage]);

  return (
    <div style={styles.container}>
      <p
        style={{
          ...styles.text,
          opacity,
          transition: 'opacity 0.4s ease',
        }}
      >
        {displayedMessage}
      </p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    minWidth: 0,
    height: 40,
    display: 'flex',
    alignItems: 'center',
    overflow: 'hidden',
  },
  text: {
    margin: 0,
    fontSize: 13,
    fontFamily: fonts.sans,
    color: colors.textSecondary,
    lineHeight: 1.4,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
};
