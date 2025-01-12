#!/usr/bin/env node

import { cli } from '../cli';

cli(process.argv).catch((error: Error) => {
  console.error('Error:', error.message);
  process.exit(1);
}); 