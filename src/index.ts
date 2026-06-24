import { config } from './config.js';
import './db/index.js'; // creates tables on first run
import { users } from './db/users.js';
import { hashPassword } from './auth/password.js';
import { startScheduler } from './indexer/scheduler.js';
import { createServer } from './api/server.js';

// Application entry point: seed the first admin, start the background indexer,
// then start the web server.

function seedFirstAdmin(): void {
  if (users.count() > 0) return;
  if (!config.seedAdmin.password) {
    console.warn('[seed] no users yet and SEED_ADMIN_PASSWORD is unset — set it in .env to create the first admin.');
    return;
  }
  users.create(config.seedAdmin.email, hashPassword(config.seedAdmin.password), true);
  console.log(`[seed] created first admin: ${config.seedAdmin.email}`);
}

seedFirstAdmin();
startScheduler();

createServer().listen(config.port, () => {
  console.log(`netivot-olam listening on http://localhost:${config.port}  (storage: ${config.storageProvider})`);
});
