import type { Edge } from '@xyflow/react';
import type { ChallengeResult } from './challenges';
import { formatCost } from './components';
import { formatLatency, formatPercent, formatRate } from './format';
import { encodeSharedSimulation, type SharedSimulation } from './shared-simulation';
import type { SimNode } from './store';

export interface ShareCardOptions {
  nodes?: SimNode[];
  edges?: Edge[];
  breakpointRps?: number | null;
  dailyLabel?: string | null;
  costPerHour?: number;
}

export function createChallengeUrl(scenario: SharedSimulation): string | null {
  const state = encodeSharedSimulation(scenario);
  if (!state) return null;

  return `${window.location.origin}${window.location.pathname}?challenge=spike&state=${state}`;
}

export function createXIntentUrl(
  result: ChallengeResult,
  challengeUrl: string,
  options: {
    breakpointRps?: number | null;
    dailyLabel?: string | null;
  } = {}
): string {
  const headline = options.dailyLabel
    ? `${options.dailyLabel}: ${result.passed ? 'survived' : 'found the bottleneck'}.`
    : result.passed
      ? 'I survived a 3x traffic spike.'
      : 'I found the bottleneck in a 3x traffic spike.';
  const breakpoint =
    options.breakpointRps !== null && options.breakpointRps !== undefined
      ? ` Breaks at ${options.breakpointRps} rps.`
      : '';
  const text = `${headline}${breakpoint} p95 ${formatLatency(result.p95Latency)}, errors ${formatPercent(result.errorRate)}. Can you beat it?`;
  const params = new URLSearchParams({ text, url: challengeUrl });
  return `https://x.com/intent/post?${params.toString()}`;
}

function drawGrid(context: CanvasRenderingContext2D, width: number, height: number) {
  context.fillStyle = '#e8eef2';
  context.fillRect(0, 0, width, height);

  context.strokeStyle = 'rgba(21, 34, 44, 0.055)';
  context.lineWidth = 1;
  for (let x = 0; x <= width; x += 24) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = 0; y <= height; y += 24) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  context.strokeStyle = 'rgba(21, 34, 44, 0.11)';
  for (let x = 0; x <= width; x += 120) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = 0; y <= height; y += 120) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
}

function truncate(
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number
): string {
  if (context.measureText(value).width <= maxWidth) return value;
  let next = value;
  while (next.length > 1 && context.measureText(`${next}…`).width > maxWidth) {
    next = next.slice(0, -1);
  }
  return `${next}…`;
}

function drawArchitecture(
  context: CanvasRenderingContext2D,
  nodes: SimNode[],
  edges: Edge[],
  bottleneckId: string | null,
  x: number,
  y: number,
  width: number,
  height: number
) {
  context.fillStyle = '#f8fbfc';
  context.strokeStyle = '#c6d2da';
  context.lineWidth = 1;
  context.fillRect(x, y, width, height);
  context.strokeRect(x, y, width, height);

  context.fillStyle = '#4e5c66';
  context.font = '700 11px Overpass, Arial, sans-serif';
  context.textBaseline = 'top';
  context.fillText('SYSTEM UNDER TEST', x + 16, y + 14);

  if (nodes.length === 0) {
    context.fillStyle = '#8b9aa4';
    context.font = '400 14px Overpass, Arial, sans-serif';
    context.fillText('No architecture captured', x + 16, y + 52);
    return;
  }

  const minX = Math.min(...nodes.map((node) => node.position.x));
  const maxX = Math.max(...nodes.map((node) => node.position.x));
  const minY = Math.min(...nodes.map((node) => node.position.y));
  const maxY = Math.max(...nodes.map((node) => node.position.y));
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const innerX = x + 24;
  const innerY = y + 44;
  const innerWidth = width - 48;
  const innerHeight = height - 68;
  const nodeWidth = 72;
  const nodeHeight = 30;

  const positions = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    const nx =
      innerX +
      ((node.position.x - minX) / spanX) * Math.max(0, innerWidth - nodeWidth);
    const ny =
      innerY +
      ((node.position.y - minY) / spanY) *
        Math.max(0, innerHeight - nodeHeight);
    positions.set(node.id, { x: nx, y: ny });
  }

  context.strokeStyle = '#8b9aa4';
  context.lineWidth = 1;
  for (const edge of edges) {
    const source = positions.get(edge.source);
    const target = positions.get(edge.target);
    if (!source || !target) continue;
    context.beginPath();
    context.moveTo(source.x + nodeWidth / 2, source.y + nodeHeight / 2);
    context.lineTo(target.x + nodeWidth / 2, target.y + nodeHeight / 2);
    context.stroke();
  }

  for (const node of nodes) {
    const position = positions.get(node.id);
    if (!position) continue;
    const isBottleneck = node.id === bottleneckId;
    context.fillStyle = isBottleneck ? '#fdf0ee' : '#f8fbfc';
    context.strokeStyle = isBottleneck ? '#bc3a2b' : '#5f6d77';
    context.lineWidth = isBottleneck ? 2 : 1;
    context.fillRect(position.x, position.y, nodeWidth, nodeHeight);
    context.strokeRect(position.x, position.y, nodeWidth, nodeHeight);

    context.fillStyle = isBottleneck ? '#8d2a20' : '#15222c';
    context.font = '600 9px Overpass, Arial, sans-serif';
    context.textBaseline = 'middle';
    context.textAlign = 'center';
    context.fillText(
      truncate(context, node.data.component.name, nodeWidth - 10),
      position.x + nodeWidth / 2,
      position.y + nodeHeight / 2
    );
    context.textAlign = 'left';
  }
}

export function downloadChallengeCard(
  result: ChallengeResult,
  baseline: ChallengeResult | null,
  attempt: number,
  options: ShareCardOptions = {}
): void {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 675;
  const context = canvas.getContext('2d');
  if (!context) return;

  drawGrid(context, canvas.width, canvas.height);

  const accent = result.passed ? '#0f7a63' : '#bc3a2b';
  const accentInk = result.passed ? '#0a5a49' : '#8d2a20';

  context.fillStyle = accent;
  context.fillRect(64, 54, 8, 34);
  context.fillStyle = '#15222c';
  context.font = '700 20px Overpass, Arial, sans-serif';
  context.textBaseline = 'middle';
  context.fillText('STACKSTRESS', 88, 72);

  context.fillStyle = '#4e5c66';
  context.font = '600 12px Overpass Mono, monospace';
  context.fillText('SPIKE ABSORPTION TEST / TEST 01', 64, 116);

  context.fillStyle = accent;
  context.font = '700 52px Overpass, Arial, sans-serif';
  context.fillText(
    result.passed ? 'System survived.' : 'Bottleneck found.',
    64,
    190
  );

  context.fillStyle = '#4e5c66';
  context.font = '400 19px Overpass, Arial, sans-serif';
  const subtitle = result.passed
    ? 'The architecture stayed inside its latency and error budget.'
    : result.bottleneckName
      ? `${result.bottleneckName} was the pressure point.`
      : 'The architecture exceeded its latency or error budget.';
  context.fillText(truncate(context, subtitle, 620), 66, 230);

  const cards = [
    { label: 'P95 LATENCY', value: formatLatency(result.p95Latency) },
    { label: 'ERROR RATE', value: formatPercent(result.errorRate) },
    { label: 'DELIVERED', value: `${formatRate(result.completedRps)}/s` },
    { label: 'RUN COST', value: formatCost(result.costPerHour) },
  ];
  const cardTop = 300;
  const cardWidth = 148;
  const cardGap = 10;
  cards.forEach((card, index) => {
    const x = 64 + index * (cardWidth + cardGap);
    context.fillStyle = '#f8fbfc';
    context.strokeStyle = '#c6d2da';
    context.lineWidth = 1;
    context.fillRect(x, cardTop, cardWidth, 108);
    context.strokeRect(x, cardTop, cardWidth, 108);
    context.fillStyle = '#5f6d77';
    context.font = '700 10px Overpass, Arial, sans-serif';
    context.fillText(card.label, x + 14, cardTop + 24);
    context.fillStyle = '#15222c';
    context.font = '700 25px Overpass Mono, monospace';
    context.fillText(card.value, x + 14, cardTop + 68);
  });

  if (attempt > 1 && baseline) {
    context.fillStyle = '#2f6f95';
    context.font = '600 14px Overpass, Arial, sans-serif';
    context.fillText(
      `Attempt ${attempt}: p95 ${formatLatency(baseline.p95Latency)} → ${formatLatency(result.p95Latency)}  /  errors ${formatPercent(baseline.errorRate)} → ${formatPercent(result.errorRate)}`,
      66,
      452
    );
  }

  if (options.breakpointRps) {
    context.fillStyle = '#4e5c66';
    context.font = '600 14px Overpass, Arial, sans-serif';
    context.fillText(
      `Breaking point: ${options.breakpointRps} rps`,
      66,
      482
    );
  }

  drawArchitecture(
    context,
    options.nodes ?? [],
    options.edges ?? [],
    result.bottleneckId,
    700,
    130,
    436,
    272
  );

  context.fillStyle = '#4e5c66';
  context.font = '600 13px Overpass, Arial, sans-serif';
  context.fillText('BUILD IT. BREAK IT. UNDERSTAND WHY.', 64, 616);
  context.textAlign = 'right';
  context.fillStyle = accentInk;
  context.font = '700 13px Overpass, Arial, sans-serif';
  context.fillText(
    options.dailyLabel ?? 'Run this challenge yourself',
    1136,
    616
  );
  context.textAlign = 'left';

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'stackstress-challenge.png';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }, 'image/png');
}
