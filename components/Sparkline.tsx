'use client';

const VIEW_WIDTH = 180;
const VIEW_HEIGHT = 38;

export interface SparklineProps {
  values: number[];
  color: string;
  height?: number;
  threshold?: number;
  /** Highlighted x-range as fractions of the plotted width, 0 to 1. */
  shade?: { from: number; to: number } | null;
  label?: string;
  className?: string;
}

export default function Sparkline({
  values,
  color,
  height = VIEW_HEIGHT,
  threshold,
  shade,
  label,
  className = 'mt-1.5 h-9 w-full',
}: SparklineProps) {
  const data = values.length > 1 ? values : [0, 0];
  const chartHeight = Math.max(8, height);
  const max = Math.max(
    ...data,
    threshold !== undefined && Number.isFinite(threshold) ? threshold : 0,
    0.0001
  );
  const step = VIEW_WIDTH / (data.length - 1);
  const points = data
    .map((value, index) => {
      const x = index * step;
      const y = chartHeight - (value / max) * (chartHeight - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const thresholdY =
    threshold !== undefined && Number.isFinite(threshold) && threshold > 0
      ? chartHeight - (threshold / max) * (chartHeight - 6) - 3
      : null;

  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${chartHeight}`}
      preserveAspectRatio="none"
      className={className}
      aria-label={label}
      role={label ? 'img' : undefined}
      aria-hidden={label ? undefined : true}
    >
      {shade && shade.to > shade.from ? (
        <rect
          x={shade.from * VIEW_WIDTH}
          y={0}
          width={Math.max(0, (shade.to - shade.from) * VIEW_WIDTH)}
          height={chartHeight}
          fill="var(--warning)"
          opacity={0.08}
        />
      ) : null}
      <line
        x1="0"
        y1={chartHeight - 2}
        x2={VIEW_WIDTH}
        y2={chartHeight - 2}
        stroke="var(--rule)"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1="0"
        y1={chartHeight / 2}
        x2={VIEW_WIDTH}
        y2={chartHeight / 2}
        stroke="var(--rule)"
        strokeWidth="1"
        strokeDasharray="2 4"
        opacity="0.7"
        vectorEffect="non-scaling-stroke"
      />
      {thresholdY !== null ? (
        <line
          x1="0"
          y1={thresholdY}
          x2={VIEW_WIDTH}
          y2={thresholdY}
          stroke="var(--alarm)"
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity="0.75"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      <polygon
        points={`0,${chartHeight} ${points} ${VIEW_WIDTH},${chartHeight}`}
        fill={color}
        opacity={0.08}
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
