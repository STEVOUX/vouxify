'use strict';

/**
 * lib/burst-handler.js — Burst traffic handler.
 */

class BurstHandler {
  constructor() {
    this._requests = [];
  }

  recordRequest() {
    const now = Date.now();
    this._requests = this._requests.filter(t => now - t < 10000);
    this._requests.push(now);
  }

  getLoadLevel() {
    const rps = this._requests.length / 10;
    if (rps > 50) return 'critical';
    if (rps > 30) return 'high';
    if (rps > 10) return 'elevated';
    return 'normal';
  }

  shouldThrottle() {
    const level = this.getLoadLevel();
    const delays = { normal: 0, elevated: 50, high: 150, critical: 300 };
    return { throttle: level !== 'normal', delayMs: delays[level] || 0 };
  }

  getAdjustedQuality(quality, loadLevel) {
    if (loadLevel === 'critical') return '480';
    if (loadLevel === 'high') return quality === '1080' ? '720' : quality;
    return quality;
  }
}

let instance = null;
function getBurstHandler() {
  if (!instance) instance = new BurstHandler();
  return instance;
}

module.exports = { getBurstHandler };
