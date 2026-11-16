const EPOCH_UTC = Date.UTC(2026, 0, 1);

export interface DailyChallenge {
  dateKey: string;
  number: number;
  seed: number;
  label: string;
}

function hashDateKey(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  return hash >>> 0 || 1;
}

export function getDailyChallenge(now = new Date()): DailyChallenge {
  const dateKey = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
  ].join('-');
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  const number = Math.floor((today - EPOCH_UTC) / 86_400_000) + 1;

  return {
    dateKey,
    number,
    seed: hashDateKey(dateKey),
    label: `Daily spike #${number}`,
  };
}
