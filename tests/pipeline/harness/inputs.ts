import { wrapStructured, type StructuredValue } from '@interpreter/utils/structured-value';
import { wrapLoadContentValue } from '@interpreter/utils/load-content-structured';
import { LoadContentResultImpl } from '@interpreter/eval/load-content';

export interface HarnessInput {
  id: string;
  label: string;
  build(): string | StructuredValue;
  description?: string;
}

function buildArrayObjectInput(): StructuredValue {
  const data = [
    { id: 'user-1', name: 'Ada', tags: ['mlld', 'pipeline'] },
    { id: 'user-2', name: 'Linus', tags: ['kernel'] }
  ];
  return wrapStructured(data, 'array', JSON.stringify(data));
}

function buildNestedArrayInput(): StructuredValue {
  const data = [
    [1, 2, 3],
    [4, 5, 6]
  ];
  return wrapStructured(data, 'array', JSON.stringify(data));
}

function buildLoaderInput(): StructuredValue {
  const result = new LoadContentResultImpl({
    content: '# Sample doc\n\n- item: 1\n- item: 2\n',
    filename: 'doc.md',
    relative: 'docs/doc.md',
    absolute: '/project/docs/doc.md'
  });
  return wrapLoadContentValue(result);
}

function buildJsonStringInput(): string {
  return JSON.stringify({
    project: 'mlld',
    status: 'active',
    contributors: ['Ada', 'Linus']
  });
}

export const HARNESS_INPUTS: HarnessInput[] = [
  {
    id: 'plain-text',
    label: 'Plain text seed',
    build: () => 'plain pipeline seed',
    description: 'Basic text to confirm text-only paths stay stable.'
  },
  {
    id: 'json-string',
    label: 'JSON string seed',
    build: buildJsonStringInput,
    description: 'String input that parses to an object in the first stage.'
  },
  {
    id: 'array-object',
    label: 'Array of objects',
    build: buildArrayObjectInput,
    description: 'Structured array with metadata-friendly contents.'
  },
  {
    id: 'nested-array',
    label: 'Nested arrays',
    build: buildNestedArrayInput,
    description: 'Structured array with nested collections to stress foreach.'
  },
  {
    id: 'loader',
    label: 'Loader result wrapper',
    build: buildLoaderInput,
    description: 'Load-content structured value with metadata fields.'
  }
];
