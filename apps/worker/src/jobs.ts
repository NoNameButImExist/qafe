import type { Redis } from '@qafe/redis';
import { Queue, Worker, type Job } from 'bullmq';
import { closeAbandonedSessions, purgeExpired, type MaintenanceDbs } from './maintenance.js';

/** BullMQ keys live under qafe:jobs:* like every other key (qafe:<module>:...). */
const PREFIX = 'qafe:jobs';
const QUEUE = 'maintenance';

export interface JobOptions {
  abandonAfterMinutes: number;
  log: (message: string) => void;
}

/**
 * Repeating housekeeping jobs (BullMQ job schedulers). With several workers each job still
 * runs once per tick: BullMQ hands it to one of them.
 */
export async function startJobs(
  connection: Redis,
  dbs: MaintenanceDbs,
  options: JobOptions,
): Promise<{ close: () => Promise<void> }> {
  const queue = new Queue(QUEUE, { connection, prefix: PREFIX });
  await queue.upsertJobScheduler(
    'close-abandoned-sessions',
    { every: 5 * 60_000 },
    {
      name: 'close-abandoned-sessions',
      opts: { removeOnComplete: 100, removeOnFail: 100 },
    },
  );
  // Every night at 03:30 (server time), outside opening hours of most venues.
  await queue.upsertJobScheduler(
    'purge-expired',
    { pattern: '30 3 * * *' },
    {
      name: 'purge-expired',
      opts: { removeOnComplete: 30, removeOnFail: 30 },
    },
  );

  const worker = new Worker(
    QUEUE,
    async (job: Job) => {
      if (job.name === 'close-abandoned-sessions') {
        const closed = await closeAbandonedSessions(dbs.ordering, options.abandonAfterMinutes);
        if (closed) options.log(`[jobs] closed ${closed} abandoned table session(s)`);
        return { closed };
      }
      if (job.name === 'purge-expired') {
        const purged = await purgeExpired(dbs);
        options.log(`[jobs] purged ${JSON.stringify(purged)}`);
        return purged;
      }
      throw new Error(`Unknown job ${job.name}`);
    },
    { connection, prefix: PREFIX, concurrency: 1 },
  );
  worker.on('failed', (job, error) =>
    options.log(`[jobs] ${job?.name ?? 'job'} failed: ${String(error)}`),
  );

  return {
    close: async () => {
      await worker.close();
      await queue.close();
    },
  };
}
