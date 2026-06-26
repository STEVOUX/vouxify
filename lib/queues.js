
  queueCache.set(key, queue);
  logger.info(`Queue initialised: ${def.name}`, { concurrency: def.concurrency });
  return queue;
}

/**
 * Return all initialised queues (does **not** create un-accessed queues).
 * Useful for health checks or graceful shutdown.
 *
 * @returns {{ name: string, queue: import('bullmq').Queue }[]}
 */
function getAllQueues() {
  return Array.from(queueCache.entries()).map(([key, queue]) => ({
    name: QUEUE_DEFS[key]?.name ?? key,
    queue,
  }));
}

/**
 * Get the concurrency setting for a platform.
 * @param {string} platform
 * @returns {number}
 */
function getConcurrency(platform) {
  const def = QUEUE_DEFS[platform.toLowerCase().trim()];
  return def ? def.concurrency : 1;
}

/**
 * Return the list of all defined platform keys.
 * @returns {string[]}
 */
function getPlatforms() {
  return Object.keys(QUEUE_DEFS);
}

/* ------------------------------------------------------------------ */
/*  Graceful shutdown                                                   */
/* ------------------------------------------------------------------ */

async function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info('Closing BullMQ queues…');
  const closing = [];
  for (const [, queue] of queueCache) {
    closing.push(
      queue.close().catch((err) =>
        logger.warn('Error closing queue', { error: err.message }),
      ),
    );
  }
  await Promise.allSettled(closing);
  queueCache.clear();
  logger.info('All queues closed');
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

/* ------------------------------------------------------------------ */
/*  Exports                                                             */
/* ------------------------------------------------------------------ */

module.exports = {
  getQueue,
  getAllQueues,
  getConcurrency,
  getPlatforms,
  QUEUE_DEFS,
  DEFAULT_JOB_OPTIONS,
  /** @internal for testing */
  _shutdown: shutdown,
};
