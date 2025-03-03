#!/usr/bin/env node

import { main } from '../cli/index.js';
import { cliLogger as logger } from '@core/utils/logger.js';

// Run CLI
main().catch((error: Error) => {
  console.error('Error:', error.message || String(error));
  process.exit(1);
}); 