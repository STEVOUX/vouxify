'use strict';

/**
 * lib/logger.js — Minimal structured logger.
 */

const isDev = process.env.NODE_ENV !== 'production';

function log(level, msg, meta = {}) {
  const entry = {
    t: new Date().toISOString(),
    level,
    msg,
    ...meta,
  };
  if (level === 'error') console.error(JSON.stringify(entry));
  else if (isDev) console.log(JSON.stringify(entry));
}

module.exports = {
  info:  (msg, meta) => log('info', msg, meta),
  warn:  (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
  debug: (msg, meta) => log('debug', msg, meta),
};
