/**
 * Central export point for all syntax examples
 * 
 * This file will export all the syntax examples from the various directive files.
 * Initially, it will only include the examples needed for the 1.0 release.
 * Additional examples will be added progressively after 1.0.
 */

// Export helpers for direct use when needed
export * from '@core/syntax/helpers/index.js';

// Export directive examples
export { textDirectiveExamples } from '@core/syntax/text.js';
export { dataDirectiveExamples } from '@core/syntax/data.js';
export { importDirectiveExamples } from '@core/syntax/import.js';
export { integrationExamples } from '@core/syntax/integration.js';

// Export newly implemented directive examples
export { pathDirectiveExamples } from '@core/syntax/path.js';
export { runDirectiveExamples } from '@core/syntax/run.js';
export { defineDirectiveExamples } from '@core/syntax/define.js';
export { embedDirectiveExamples } from '@core/syntax/embed.js';
export { codefenceExamples } from '@core/syntax/codefence.js';
export { contentExamples } from '@core/syntax/content.js';
export { commentExamples } from '@core/syntax/comments.js'; 