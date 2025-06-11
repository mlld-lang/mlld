import { createLLMXML } from 'llmxml';

/**
 * Shared LLMXML instance to avoid creating multiple instances
 * which can lead to EventEmitter memory leaks
 */
export const llmxmlInstance = createLLMXML({
  verbose: false,
  warningLevel: 'none', // Suppress llmxml logging
  tagFormat: 'SCREAMING_SNAKE' // Use SCREAMING_SNAKE_CASE for XML tags
});