#!/usr/bin/env node

import { cmd } from '../cli';
import { interpreterLogger } from '../utils/logger';

cmd(process.argv).catch((error: Error) => {
  interpreterLogger.error('CLI execution failed', {
    error: error instanceof Error ? error.message : String(error)
  });
  process.exit(1);
}); 