type HitMap = Map<string, number[]>;

const hits: HitMap = new Map();

export const allowRateLimit = (
  key: string,
  limit: number,
  windowMs = 60_000,
  now = Date.now(),
) => {
  if (limit <= 0) {
    return true;
  }
  const windowStart = now - windowMs;
  const current = (hits.get(key) || []).filter((stamp) => stamp > windowStart);
  if (current.length >= limit) {
    hits.set(key, current);
    return false;
  }
  current.push(now);
  hits.set(key, current);
  return true;
};

export const resetRateLimitForTests = () => {
  hits.clear();
};
