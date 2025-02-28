/**
 * Central export point for all syntax examples
 * 
 * This file will export all the syntax examples from the various directive files.
 * Initially, it will only include the examples needed for the 1.0 release.
 * Additional examples will be added progressively after 1.0.
 */

// Export helpers for direct use when needed
export * from '@core/constants/syntax/helpers';

// Export directive examples
export { textDirectiveExamples } from '@core/constants/syntax/text';
export { dataDirectiveExamples } from '@core/constants/syntax/data';
export { importDirectiveExamples } from '@core/constants/syntax/import';
export { integrationExamples } from '@core/constants/syntax/integration';

// Export newly implemented directive examples
export { pathDirectiveExamples } from '@core/constants/syntax/path';
export { runDirectiveExamples } from '@core/constants/syntax/run';
export { defineDirectiveExamples } from '@core/constants/syntax/define';
export { embedDirectiveExamples } from '@core/constants/syntax/embed';
export { codefenceExamples } from '@core/constants/syntax/codefence';
export { contentExamples } from '@core/constants/syntax/content';
export { commentExamples } from '@core/constants/syntax/comments'; 