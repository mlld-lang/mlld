#!/usr/bin/env node

import { cli } from '../cli/index.js';

cli(process.argv).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
}); 