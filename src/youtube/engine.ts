export type PlayerState = 'idle'|'content'|'ad-detected'|'ad-skippable'|'ad-unskippable'|'transition'|'loading-failed'|'recovering';
export const YOUTUBE_SELECTORS = [
  'ytd-display-ad-renderer','ytd-promoted-sparkles-web-renderer','ytd-promoted-video-renderer',
  'ytd-in-feed-ad-layout-renderer','ytd-ad-slot-renderer','ytd-compact-promoted-video-renderer',
  'ytd-reel-video-renderer[is-ad]','#player-ads','#masthead-ad','.ytp-ad-overlay-container'
];
export class YoutubeEngine {
  constructor(private onInvalidated: () => void = () => {}) {}
  private active = false;
  private aggressive = false;
  private state: PlayerState = 'idle';
  private player: Element | null = null;
  private observer?: MutationObserver;
  private timer?: ReturnType<typeof setInterval>;
  private pending?: ReturnType<typeof setTimeout>;
  private heartbeat?: ReturnType<typeof setInterval>;
  private clicks = 0;
  private lastClick = 0;
  private failed = false;
  private waitingSince = 0;
  private lastTime = -1;
  private debug = false;
  private signal = () => document.dispatchEvent(new CustomEvent('noir-youtube-config-v1', {detail:JSON.stringify({version:1,enabled:this.active&&!this.failed})}));
  configure(enabled: boolean, aggressive: boolean, debug = false) {
    this.aggressive = aggressive; this.debug = debug;
    if (!enabled) {this.stop(); return;}
    if (this.active) {this.signal(); return;}
    this.active = true; this.failed = false;
    this.signal();
    this.heartbeat = setInterval(() => {
      // Extension invalidation/removal stops page effects, including MAIN hooks.
      try {if (!chrome.runtime.id) {this.stop(); this.onInvalidated(); return;} this.signal();} catch {this.stop(); this.onInvalidated();}
    }, 5000);
    document.addEventListener('yt-navigate-start', this.navigateStart);
    document.addEventListener('yt-navigate-finish', this.navigateFinish);
    window.addEventListener('popstate', this.navigateFinish);
    window.addEventListener('pagehide', this.suspend);
    window.addEventListener('pageshow', this.resume);
    // One bounded discovery pass per second handles player replacement and Shorts.
    this.timer = setInterval(this.inspect, 1000);
    this.inspect();
  }
  private setState(next: PlayerState) {
    if (next === this.state) return;
    this.state = next;
    if (this.debug) console.debug('[Noir YouTube]', next);
  }
  private navigateStart = () => {
    this.observer?.disconnect(); this.player = null;
    this.clicks = 0; this.lastTime = -1; this.waitingSince = 0;
    this.setState('transition');
  };
  private navigateFinish = () => {this.navigateStart(); this.schedule();};
  private suspend = () => {this.signalDisabled();};
  private resume = () => {this.signal(); this.schedule();};
  private signalDisabled() {document.dispatchEvent(new CustomEvent('noir-youtube-config-v1',{detail:JSON.stringify({version:1,enabled:false})}));}
  private schedule = () => {
    if (this.pending || !this.active) return;
    this.pending = setTimeout(() => {this.pending = undefined; this.inspect();}, this.aggressive ? 100 : 250);
  };
  private inspect = () => {
    if (!this.active) return;
    try {
      const player = document.querySelector('ytd-reel-video-renderer[is-active] #movie_player') || document.querySelector('#movie_player');
      if (player !== this.player) {
        this.observer?.disconnect(); this.player = player; this.clicks = 0; this.waitingSince = 0;
        if (player) {
          this.observer = new MutationObserver(this.schedule);
          this.observer.observe(player,{childList:true,subtree:true,attributes:true,attributeFilter:['class','disabled','hidden','style']});
        }
      }
      if (!player) {this.setState('idle'); return;}
      const video = player.querySelector<HTMLVideoElement>('video');
      const now = Date.now();
      if (video && !video.paused && video.readyState < 3 && video.currentTime === this.lastTime) this.waitingSince ||= now;
      else this.waitingSince = 0;
      this.lastTime = video?.currentTime ?? -1;
      if (video?.error || (this.waitingSince && now - this.waitingSince > 12000)) {
        this.setState('loading-failed');
        // Fail open for the rest of this document. Do not reload or retry a broken response.
        this.failed = true; this.signal(); this.setState('recovering'); return;
      }
      if (!player.classList.contains('ad-showing')) {
        this.clicks = 0; this.setState(video ? 'content' : 'idle'); return;
      }
      this.setState('ad-detected');
      const skip = [...player.querySelectorAll<HTMLButtonElement>('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button')]
        .find(node => !node.disabled && !node.hidden && node.getBoundingClientRect().width > 0 && getComputedStyle(node).visibility !== 'hidden' && getComputedStyle(node).display !== 'none');
      this.setState(skip ? 'ad-skippable' : 'ad-unskippable');
      if (skip && this.clicks < 3 && now - this.lastClick >= 1000 && player.classList.contains('ad-showing')) {
        this.clicks++; this.lastClick = now; skip.click(); this.setState('transition');
      }
      // No seeking, speed changes or muting: ad-showing can lag behind a reused media element.
    } catch {this.failed = true; this.signal(); this.setState('recovering');}
  };
  stop() {
    this.active = false; this.signalDisabled(); this.observer?.disconnect(); this.observer = undefined;
    clearInterval(this.timer); clearInterval(this.heartbeat); clearTimeout(this.pending);
    this.timer = this.heartbeat = this.pending = undefined; this.player = null;
    document.removeEventListener('yt-navigate-start', this.navigateStart);
    document.removeEventListener('yt-navigate-finish', this.navigateFinish);
    window.removeEventListener('popstate', this.navigateFinish);
    window.removeEventListener('pagehide', this.suspend);
    window.removeEventListener('pageshow', this.resume);
    this.setState('idle');
  }
}
