import { useState, useRef, useCallback, useEffect } from 'react';

type UseTypewriterOptions = {
  /** Full text to animate */
  text: string;
  /** Typing speed in ms per character (lower = faster). Default 5. */
  speed?: number;
  /** Whether to start typing immediately. Default true. */
  autoStart?: boolean;
  /** Whether to animate the text reveal. When false, text is shown immediately. Default true. */
  animate?: boolean;
};

type UseTypewriterReturn = {
  /** Text progressively revealed so far */
  displayedText: string;
  /** Whether animation is still in progress */
  isTyping: boolean;
  /** Whether typing has finished */
  isComplete: boolean;
  /** Instantly reveal all remaining text */
  skip: () => void;
  /** Restart animation from scratch */
  restart: () => void;
};

/**
 * Simulates a typewriter effect – progressively reveals `text` character by character.
 * Includes a slight natural pause at punctuation marks.
 */
export function useTypewriter({
  text,
  speed = 5,
  autoStart = true,
  animate = true,
}: UseTypewriterOptions): UseTypewriterReturn {
  const [displayedText, setDisplayedText] = useState(autoStart ? '' : '');
  const [isComplete, setIsComplete] = useState(!text);
  const indexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(autoStart && text.length > 0);
  const [isTyping, setIsTyping] = useState(autoStart && text.length > 0);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    if (indexRef.current >= text.length) {
      clearTimer();
      setIsTyping(false);
      setIsComplete(true);
      isTypingRef.current = false;
      return;
    }

    // Determine how many chars to reveal this tick
    const remaining = text.slice(indexRef.current);

    // Add small pauses at punctuation for a natural feel
    const firstChar = remaining[0];
    let delay = speed;
    if (firstChar === '\n') {
      delay = speed * 1.2;
    } else if (firstChar === '.' || firstChar === '!' || firstChar === '?') {
      delay = speed * 1.5;
    } else if (firstChar === ',' || firstChar === ';' || firstChar === ':') {
      delay = speed * 1.2;
    }

    // Reveal 2-4 characters at a time for maximum speed while still visible
    const charsToReveal = firstChar === '\n' ? 1 : (Math.random() < 0.4 ? 3 : Math.random() < 0.5 ? 4 : 2);
    const endIndex = Math.min(indexRef.current + charsToReveal, text.length);

    setDisplayedText(text.slice(0, endIndex));
    indexRef.current = endIndex;

    if (endIndex >= text.length) {
      setIsTyping(false);
      setIsComplete(true);
      isTypingRef.current = false;
      return;
    }

    timerRef.current = setTimeout(tick, delay);
  }, [text, speed]);

  useEffect(() => {
    // Reset state when text changes
    indexRef.current = 0;
    setIsComplete(false);
    clearTimer();

    if (!text) {
      setDisplayedText('');
      setIsTyping(false);
      setIsComplete(true);
      isTypingRef.current = false;
      return;
    }

    if (autoStart && animate) {
      setDisplayedText('');
      setIsTyping(true);
      isTypingRef.current = true;
      timerRef.current = setTimeout(tick, speed);
    } else {
      setDisplayedText(text);
      setIsTyping(false);
      setIsComplete(true);
      isTypingRef.current = false;
    }

    return () => {
      clearTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const skip = useCallback(() => {
    clearTimer();
    setDisplayedText(text);
    setIsTyping(false);
    setIsComplete(true);
    isTypingRef.current = false;
    indexRef.current = text.length;
  }, [text, clearTimer]);

  const restart = useCallback(() => {
    clearTimer();
    indexRef.current = 0;
    setDisplayedText('');
    setIsTyping(false);
    setIsComplete(false);

    if (text) {
      setIsTyping(true);
      isTypingRef.current = true;
      timerRef.current = setTimeout(tick, speed);
    }
  }, [text, speed, tick, clearTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  return { displayedText, isTyping, isComplete, skip, restart };
}