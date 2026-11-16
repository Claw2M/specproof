#!/usr/bin/env node
import { startMcpServer } from './index.js';

startMcpServer().catch((err) => {
  console.error('SpecProof MCP server failed:', err);
  process.exit(1);
});
