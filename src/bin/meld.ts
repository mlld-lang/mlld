#!/usr/bin/env node

import { cli } from '../cli';
import { interpreterLogger } from '../utils/logger';

cli(process.argv).catch((error: Error) => {
  interpreterLogger.error('CLI execution failed', {
    error: error instanceof Error ? error.message : String(error)
  });
  process.exit(1);
}); 