import type { ChallengeResult } from './challenges';
import { formatLatency, formatPercent, formatRate } from './format';
import { encodeSharedSimulation, type SharedSimulation } from './shared-simulation';

export function createChallengeUrl(scenario: SharedSimulation): string | null {
  const state = encodeSharedSimulation(scenario);
  if (!state) return null;

  return `${window.location.origin}${window.location.pathname}?challenge=spike&state=${state}`;
}

export function createXIntentUrl(result: ChallengeResult, challengeUrl: string): string {
  const headline = result.passed
    ? 'I survived a 3x traffic spike.'
    : 'I found the bottleneck in a 3x traffic spike.';
  const text = `${headline} p95 ${formatLatency(result.p95Latency)}, errors ${formatPercent(result.errorRate)}. Can you beat it?`;
  const params = new URLSearchParams({ text, url: challengeUrl });
  return `https://x.com/intent/post?${params.toString()}`;
}

export function downloadChallengeCard(
  result: ChallengeResult,
  baseline: ChallengeResult | null,
  attempt: number
): void {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 675;
  const context = canvas.getContext('2d');
  if (!context) return;

  const background = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  background.addColorStop(0, '#0b1723');
  background.addColorStop(1, '#10111c');
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = 'rgba(125, 211, 252, 0.08)';
  context.lineWidth = 1;
  for (let x = 0; x <= canvas.width; x += 48) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, canvas.height);
    context.stroke();
  }
  for (let y = 0; y <= canvas.height; y += 48) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(canvas.width, y);
    context.stroke();
  }

  context.fillStyle = '#38bdf8';
  context.fillRect(64, 62, 8, 34);
  context.textBaseline = 'middle';
  context.fillStyle = '#cbd5e1';
  context.font = '700 20px Arial, sans-serif';
  context.fillText('STACKSTRESS', 92, 79);
  context.fillStyle = '#94a3b8';
  context.font = '600 16px Arial, sans-serif';
  context.fillText('3X TRAFFIC CHALLENGE', 64, 142);

  context.fillStyle = result.passed ? '#6ee7b7' : '#fda4af';
  context.font = '700 54px Arial, sans-serif';
  context.fillText(result.passed ? 'System survived.' : 'Bottleneck found.', 64, 220);
  context.fillStyle = '#cbd5e1';
  context.font = '400 22px Arial, sans-serif';
  context.fillText(
    result.bottleneckName
      ? `${result.bottleneckName} was the pressure point.`
      : 'Can your architecture handle the next spike?',
    66,
    270
  );

  const cards = [
    { label: 'P95 LATENCY', value: formatLatency(result.p95Latency) },
    { label: 'ERROR RATE', value: formatPercent(result.errorRate) },
    { label: 'COMPLETED', value: `${formatRate(result.completedRps)}/s` },
  ];
  const cardTop = 346;
  const cardWidth = 334;
  const cardGap = 28;
  cards.forEach((card, index) => {
    const x = 64 + index * (cardWidth + cardGap);
    context.fillStyle = 'rgba(15, 23, 42, 0.88)';
    context.fillRect(x, cardTop, cardWidth, 126);
    context.strokeStyle = 'rgba(148, 163, 184, 0.22)';
    context.strokeRect(x, cardTop, cardWidth, 126);
    context.fillStyle = '#94a3b8';
    context.font = '700 14px Arial, sans-serif';
    context.fillText(card.label, x + 22, cardTop + 30);
    context.fillStyle = '#f8fafc';
    context.font = '700 32px Arial, sans-serif';
    context.fillText(card.value, x + 22, cardTop + 78);
  });

  if (attempt > 1 && baseline) {
    context.fillStyle = '#7dd3fc';
    context.font = '600 17px Arial, sans-serif';
    context.fillText(
      `Before: ${formatLatency(baseline.p95Latency)} p95  |  After: ${formatLatency(result.p95Latency)} p95`,
      66,
      520
    );
  }

  context.fillStyle = '#64748b';
  context.font = '600 15px Arial, sans-serif';
  context.fillText('BUILD IT. BREAK IT. UNDERSTAND WHY.', 64, 612);
  context.textAlign = 'right';
  context.fillStyle = '#7dd3fc';
  context.fillText('Run this challenge yourself', 1136, 612);

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
