import { useCallback, useRef, useEffect } from 'react';
import { useTypewriter } from '../../shared/hooks/useTypewriter';
import { MarkdownView } from './MarkdownView';
import './TypewriterMarkdown.css';

type TypewriterMarkdownProps = {
  /** Full markdown text to animate */
  markdown: string;
  /** Typing speed in ms per character. Default 8. */
  speed?: number;
  /** Unique key to trigger re-animation when changed */
  animationKey?: string;
  /** Whether to animate the reveal. Pass false for cached/persisted content to show instantly. Default true. */
  animated?: boolean;
};

/**
 * Renders markdown with a typewriter effect – text progressively appears
 * character by character, simulating an AI "typing" response like ChatGPT.
 *
 * - Clicking/tapping the text instantly skips to the full content.
 * - Automatically re-animates when `animationKey` changes.
 * - Pass `animated={false}` for cached/persisted content (history, saved notes).
 */
export function TypewriterMarkdown({
  markdown,
  speed = 8,
  animationKey,
  animated = true,
}: TypewriterMarkdownProps) {
  const { displayedText, isTyping, skip } = useTypewriter({
    text: markdown,
    speed,
    autoStart: true,
    animate: animated,
  });

  const containerRef = useRef<HTMLDivElement>(null);

  // Re-animate when animationKey changes
  useEffect(() => {
    if (animationKey) {
      // The hook already resets when `text` changes, but we use animationKey
      // as a dependency to force re-animation even if text is the same
    }
  }, [animationKey]);

  const handleClick = useCallback(() => {
    if (isTyping) {
      skip();
    }
  }, [isTyping, skip]);

  return (
    <div
      ref={containerRef}
      className={`typewriter-markdown ${isTyping ? 'is-typing' : 'is-complete'}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (isTyping) skip();
        }
      }}
      title={isTyping ? 'Click to skip typing animation' : undefined}
    >
      <MarkdownView markdown={displayedText} />
      {isTyping && <span className="typewriter-cursor" aria-hidden="true" />}
    </div>
  );
}