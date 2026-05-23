export function animateScrollToTop(container: Element | Window, duration = 450) {
  const startPos = container === window ? window.scrollY : (container as HTMLElement).scrollTop;
  const startTime = performance.now();

  // Custom animation loop that won't be interrupted by React DOM updates
  function animateScroll(currentTime: number) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Ease out cubic (starts fast, slows down smoothly)
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    const currentPos = startPos * (1 - easeProgress);

    if (container === window) {
      window.scrollTo(0, currentPos);
    } else {
      (container as HTMLElement).scrollTop = currentPos;
    }

    if (progress < 1) {
      requestAnimationFrame(animateScroll);
    }
  }

  requestAnimationFrame(animateScroll);
}
