import { useEffect, useState, useRef } from 'react';

export interface CDNImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onLoad' | 'onError' | 'loading'> {
  src: string;
  fallback?: React.ReactNode;
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
  loading?: 'lazy' | 'eager' | boolean;
  onLoad?: (event: React.SyntheticEvent<HTMLImageElement>) => void;
  onError?: (error: Error) => void;
}

export function CDNImage({
  src,
  alt = '',
  fallback,
  maxRetries = 3,
  retryDelay = 1500,
  timeout = 8000,
  loading,
  className,
  style,
  onLoad,
  onError,
  ...props
}: CDNImageProps) {
  // Convert boolean loading to HTML attribute value
  const loadingAttr = loading === true ? 'lazy' : loading === false ? undefined : loading;
  const [imageState, setImageState] = useState<{
    status: 'loading' | 'loaded' | 'error';
    retryCount: number;
    currentSrc: string;
  }>({
    status: 'loading',
    retryCount: 0,
    currentSrc: src,
  });

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef<boolean>(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Reset state when the original src changes
  useEffect(() => {
    setImageState({
      status: 'loading',
      retryCount: 0,
      currentSrc: src,
    });
  }, [src]);

  // Set up a timeout for the current source when loading
  useEffect(() => {
    if (imageState.status !== 'loading') {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (timeout) {
      timeoutRef.current = setTimeout(() => {
        handleError(new Error('Image load timeout'));
      }, timeout);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [imageState.currentSrc, imageState.status, timeout]);

  const handleLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    
    // Check if the image loaded is actually valid (naturalWidth/Height > 0)
    // Sometimes corrupted/broken image files still fire onload but have 0 width/height
    if (img.naturalWidth === 0 || img.naturalHeight === 0) {
      handleError(new Error('Invalid image dimensions'));
      return;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (isMounted.current) {
      setImageState((prev) => ({
        ...prev,
        status: 'loaded',
      }));
    }
    
    onLoad?.(event);
  };

  const handleError = (error: Error) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (!isMounted.current) return;

    setImageState((prev) => {
      if (prev.retryCount < maxRetries) {
        const nextRetry = prev.retryCount + 1;
        
        let newSrc = src;
        try {
          if (!src.startsWith('data:')) {
            const url = new URL(src, window.location.href);
            url.searchParams.set('t', String(Date.now()));
            url.searchParams.set('retry', String(nextRetry));
            newSrc = url.toString();
          }
        } catch (e) {
          const separator = src.includes('?') ? '&' : '?';
          newSrc = `${src}${separator}t=${Date.now()}&retry=${nextRetry}`;
        }

        // Delay the retry to give network/CDN a chance to recover
        setTimeout(() => {
          if (isMounted.current) {
            setImageState((curr) => {
              // Ensure we haven't reset/changed src in the meantime
              if (curr.currentSrc === prev.currentSrc && curr.status === 'loading') {
                return curr; // already in correct loading state
              }
              return {
                ...curr,
                currentSrc: newSrc,
                status: 'loading',
              };
            });
          }
        }, retryDelay * nextRetry);

        return {
          ...prev,
          retryCount: nextRetry,
          status: 'loading',
        };
      } else {
        onError?.(error);
        return {
          ...prev,
          status: 'error',
        };
      }
    });
  };

  if (imageState.status === 'error') {
    return <>{fallback || null}</>;
  }

  // To prevent the browser's default broken image icon from displaying while loading,
  // we visually hide it by scaling it down to 1px and setting opacity to 0.
  // We do not use `display: none` or `visibility: hidden` because doing so would
  // hide it from the accessibility tree, which breaks screen readers and testing
  // queries like Testing Library's `getByRole('img')`.
  const isLoaded = imageState.status === 'loaded';
  const displayStyle = style?.display || 'block';

  return (
    <>
      {!isLoaded && fallback}
      <img
        {...props}
        src={imageState.currentSrc}
        alt={alt}
        className={className}
        loading={loadingAttr}
        style={{
          ...style,
          display: isLoaded ? displayStyle : 'block',
          position: isLoaded ? style?.position : 'absolute',
          width: isLoaded ? style?.width : '1px',
          height: isLoaded ? style?.height : '1px',
          opacity: isLoaded ? style?.opacity ?? 1 : 0,
          pointerEvents: isLoaded ? style?.pointerEvents : 'none',
        }}
        onLoad={handleLoad}
        onError={() => handleError(new Error('Failed to load image'))}
      />
    </>
  );
}
