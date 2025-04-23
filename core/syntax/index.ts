/**
 * Central export point for all syntax examples
 * 
 * This file will export all the syntax examples from the various directive files.
 * Initially, it will only include the examples needed for the 1.0 release.
 * Additional examples will be added progressively after 1.0.
 */

// Export helpers for direct use when needed
export * from '@core/syntax/helpers/index';

// Export directive examples
export { textDirectiveExamples } from '@core/syntax/text';
export { dataDirectiveExamples } from '@core/syntax/data';
export { importDirectiveExamples } from '@core/syntax/import';
export { integrationExamples } from '@core/syntax/integration';

// Export newly implemented directive examples
export { pathDirectiveExamples } from '@core/syntax/path';
export { runDirectiveExamples } from '@core/syntax/run';
export { defineDirectiveExamples } from '@core/syntax/define';
export { embedDirectiveExamples } from '@core/syntax/embed';
export { codefenceExamples } from '@core/syntax/codefence';
export { contentExamples } from '@core/syntax/content';
export { commentExamples } from '@core/syntax/comments'; 