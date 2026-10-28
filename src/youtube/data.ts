// Only recognized player responses are eligible; content and live streams pass through.
type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => !!value && typeof value === 'object' && !Array.isArray(value);
export function sanitizePlayer(value: unknown): unknown {
  if (!record(value) || !record(value.videoDetails) || typeof value.videoDetails.videoId !== 'string' ||
      !record(value.playabilityStatus) || value.playabilityStatus.status !== 'OK' ||
      !record(value.streamingData) || value.videoDetails.isLiveContent === true) return value;
  let result = value;
  for (const key of ['adPlacements', 'playerAds', 'adSlots']) {
    const entries = value[key];
    if (!Array.isArray(entries) || entries.length === 0) continue;
    // Unknown schemas fail open. Never recursively delete similarly named content fields.
    const expected = key === 'adPlacements' ? 'adPlacementRenderer' : key === 'playerAds' ? 'playerLegacyDesktopWatchAdsRenderer' : 'adSlotRenderer';
    if (!entries.every(entry => record(entry) && record(entry[expected]))) continue;
    if (result === value) result = {...value};
    result[key] = [];
  }
  return result;
}
// get_watch returns [{playerResponse: ...}, {watchNextResponse: ...}].
// Inspect only this explicit envelope; never prune arbitrary nested content.
export function sanitizePlayerPayload(value: unknown): unknown {
  const direct = sanitizePlayer(value);
  if (direct !== value) return direct;
  const envelope = (entry: unknown): unknown => {
    if (!record(entry) || !record(entry.playerResponse)) return entry;
    const next = sanitizePlayer(entry.playerResponse);
    return next === entry.playerResponse ? entry : {...entry, playerResponse:next};
  };
  if (!Array.isArray(value)) {
    const result = envelope(value);
    if (!record(result) || !Array.isArray(result.entries)) return result;
    const entries = result.entries.filter(entry => {
      if (!record(entry) || !record(entry.command) || !record(entry.command.reelWatchEndpoint)) return true;
      const params = entry.command.reelWatchEndpoint.adClientParams;
      return !record(params) || params.isAd !== true;
    });
    return entries.length === result.entries.length ? result : {...result, entries};
  }
  let changed = false;
  const next = value.map(entry => {
    const result = envelope(entry);
    changed ||= result !== entry;
    return result;
  });
  return changed ? next : value;
}
export function playerEndpoint(input: unknown, base: string): boolean {
  try {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input instanceof Request ? input.url : '', base);
    return url.origin === new URL(base).origin && (url.pathname === '/youtubei/v1/player' || url.pathname === '/youtubei/v1/get_watch' || url.pathname === '/youtubei/v1/reel/reel_watch_sequence');
  } catch { return false; }
}
