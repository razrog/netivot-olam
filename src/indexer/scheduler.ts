import cron from 'node-cron';
import { config } from '../config.js';
import { runIndex } from './indexer.js';

// Background job: index once at startup, then on a schedule. Runs in the same
// process as the web server (one cheap box, no separate worker needed).

export function startScheduler(): void {
  runIndex()
    .then((r) => console.log(`[indexer] startup scan: +${r.added} new (${r.total} files total)`))
    .catch((err) => console.error('[indexer] startup scan failed:', err));

  cron.schedule(config.indexCron, () => {
    runIndex()
      .then((r) => {
        if (r.added > 0) console.log(`[indexer] scheduled scan: +${r.added} new`);
      })
      .catch((err) => console.error('[indexer] scheduled scan failed:', err));
  });

  console.log(`[indexer] scheduled with cron "${config.indexCron}"`);
}
