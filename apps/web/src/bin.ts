#!/usr/bin/env node
import path from 'node:path';
import { seedDemoData } from './demoData.js';
import { createCloudServer } from './server.js';

const port = Number(process.env.PORT ?? 4310);
const dbPath = path.resolve(process.env.SPECPROOF_DB_PATH ?? './.specproof-cloud/cloud.sqlite');
const apiToken = process.env.SPECPROOF_CLOUD_TOKEN;
const withDemo = process.argv.includes('--demo');

const { server, store } = createCloudServer({ dbPath, apiToken });

if (withDemo && store.listRunSummaries({ limit: 1 }).length === 0) {
  const seeded = seedDemoData(store);
  console.log(`Seeded ${seeded.runsCreated} demo runs and ${seeded.specsCreated} specs.`);
}

server.listen(port, () => {
  console.log(`SpecProof Team Cloud listening on http://localhost:${port}`);
});

function shutdown(signal: string): void {
  console.log(`Received ${signal}, shutting down SpecProof Team Cloud...`);
  server.close(() => {
    store.close();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
