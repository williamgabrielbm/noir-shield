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
export function playerEndpoint(input: unknown, base: string): boolean {
  try {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input instanceof Request ? input.url : '', base);
    return url.origin === new URL(base).origin && url.pathname === '/youtubei/v1/player';
  } catch { return false; }
}
