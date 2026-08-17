const KEY = "outpost:progress";

export const EMPTY_PROGRESS = {
  best: 0,
  wins: 0,
  plays: 0,
  updatedAt: null,
};

export function mergeProgress(previous, state, now = new Date()) {
  const base = { ...EMPTY_PROGRESS, ...(previous ?? {}) };
  const score = Number(state?.score ?? 0);
  return {
    ...base,
    best: Math.max(base.best, score),
    wins: base.wins + (state?.outcome === "won" ? 1 : 0),
    plays: base.plays + (state?.outcome !== "playing" ? 1 : 0),
    updatedAt: now.toISOString(),
    last: state?.outcome !== "playing" ? { score, outcome: state.outcome, day: state.day } : base.last,
  };
}

export async function loadProgress() {
  try {
    await globalThis.PG.ready;
    const raw = await globalThis.PG.kv.get(KEY);
    if (!raw) return { ...EMPTY_PROGRESS };
    return { ...EMPTY_PROGRESS, ...JSON.parse(raw) };
  } catch {
    return { ...EMPTY_PROGRESS };
  }
}

export async function saveProgress(payload, onError) {
  try {
    await globalThis.PG.kv.put(KEY, JSON.stringify(payload));
  } catch (error) {
    onError?.(error);
  }
}
