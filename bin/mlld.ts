#!/usr/bin/env node

import { main } from '../cli/index';
import { cliLogger as logger } from '@core/utils/logger';

// Run CLI
const args = process.argv.slice(2);
const hasWatchFlag = args.includes('--watch') || args.includes('-w');

main(args)
  .then(async () => {
    if (!hasWatchFlag) {
      // Prevent lingering handles (formatters, shadow env timers) from keeping the process alive
      await new Promise(resolve => setTimeout(resolve, 10));
      process.exit(0);
    }
  })
  .catch((error: Error) => {
    process.exit(1);
  });
