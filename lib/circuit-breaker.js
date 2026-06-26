'use strict';

/**
 * lib/circuit-breaker.js — Simple per-platform circuit breaker.
 */

const FAILURE_THRESHOLD = 5;
const RECOVERY_TIMEOUT = 60000; // 1 minute

const breakers = new Map();

class CircuitBreaker {
  constructor(platform) {
    this.platform = platform;
    this.failures = 0;
    this.state = 'closed'; // closed | open | half-open
    this.lastFailure = null;
  }

  async fire(fn) {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > RECOVERY_TIMEOUT) {
        this.state = 'half-open';
      } else {
        throw new Error(`Circuit open for ${this.platform}`);
      }
    }
    try {
      const result = await fn();
      this.failures = 0;
      this.state = 'closed';
      return result;
    } catch (err) {
      this.failures++;
      this.lastFailure = Date.now();
      if (this.failures >= FAILURE_THRESHOLD) this.state = 'open';
      throw err;
    }
  }
}

function getBreaker(platform) {
  if (!breakers.has(platform)) breakers.set(platform, new CircuitBreaker(platform));
  return breakers.get(platform);
}

module.exports = { getBreaker };
