// Entry point: `yarn workspace @obs-producer/server start` (or `dev` to restart on changes).
import pkg from '../package.json' with { type: 'json' };
import { loadConfig } from './config.ts';
import { startServer } from './server.ts';

const server = await startServer(loadConfig(), { version: pkg.version });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
