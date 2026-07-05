import { useMemo } from 'react';

type SparklineProps = {
  data: { count: number }[];
  width?: number;
  height?: number;
  stroke?: string;
  strokeWidth?: number;
};

export function Sparkline({
  data,
  width = 60,
  height = 20,
  stroke = 'currentColor',
  strokeWidth = 1.5,
}: SparklineProps) {
  const points = useMemo(() => {
    if (!data || data.length < 2) return '';
    const counts = data.map((d) => d.count);
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    const range = max - min === 0 ? 1 : max - min;

    return data
      .map((d, index) => {
        const x = (index / (data.length - 1)) * width;
        // Invert Y axis because in SVG, Y=0 is the top edge
        const y = height - ((d.count - min) / range) * (height - 2) - 1;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [data, width, height]);

  if (!data || data.length < 2) return null;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <style>{`
        @keyframes drawLine {
          from {
            stroke-dashoffset: 1000;
            opacity: 0;
          }
          to {
            stroke-dashoffset: 0;
            opacity: 1;
          }
        }
        .sparkline-path {
          stroke-dasharray: 1000;
          stroke-dashoffset: 1000;
          animation: drawLine 0.6s ease-out forwards;
        }
      `}</style>
      <polyline
        className="sparkline-path"
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}
