import { vi, beforeEach } from 'vitest';
import * as pathModule from 'path';
import { addMockFile, clearMocks, FileSystemError } from '../__mocks__/fs';

// Mock path module first
vi.mock('path', async () => {
  const { createPathMock } = await import('../../tests/__mocks__/path');
  return createPathMock({
    testRoot: '/Users/adam/dev/meld/test/_tmp',
    testHome: '/Users/adam/dev/meld/test/_tmp/home',
    testProject: '/Users/adam/dev/meld/test/_tmp/project'
  });
});

// Import path utils after mock setup
import { pathTestUtils } from '../../tests/__mocks__/path';

// Basic markdown fixture
const basicMd = `# Basic Document

## Section One
Some content in section one

## Section Two
Some content in section two

### Nested Section
This is a nested section

\`\`\`typescript
function test() {
  console.log('Hello');
}
\`\`\`
`;

// Complex markdown fixture
const complexMd = `# Complex Document

## 你好，世界
Some unicode content

## 🎉 Emoji Title 🚀
こんにちは and Café

## Code Blocks
\`\`\`typescript
interface Test {
  name: string;
}
\`\`\`

\`\`\`python
def hello():
    print("Hello")
\`\`\`

## About the Project
Project info

### About Development
Dev info

## Getting Started (Quick Guide)
This section has a title with parentheses
`;

// Edge cases markdown fixture
const edgeCasesMd = `# Edge Cases

## Malformed Code Block
\`\`\`typescript
const x = {
  // Missing closing brace

## Incomplete Code Fence
\`\`\`python
def test():
    print("No closing fence")

## Empty Section

## HTML in Markdown
<h1>Raw HTML header</h1>
<div class="test">
  Some content
</div>
`;

// Basic XML fixture
const basicXml = `<?xml version="1.0" encoding="UTF-8"?>
<Document title="Basic Document">
  <Section title="Section One" hlevel="2">
    <Content>Some content in section one</Content>
  </Section>
  <Section title="Section Two" hlevel="2">
    <Content>Some content in section two</Content>
    <Section title="Nested Section" hlevel="3">
      <Content>This is a nested section</Content>
      <Code language="typescript">function test() {
  console.log('Hello');
}</Code>
    </Section>
  </Section>
</Document>`;

// Complex XML fixture
const complexXml = `<?xml version="1.0" encoding="UTF-8"?>
<Document title="Complex Document">
  <Section title="你好，世界" hlevel="2">
    <Content>Some unicode content</Content>
  </Section>
  <Section title="🎉 Emoji Title 🚀" hlevel="2">
    <Content>こんにちは and Café</Content>
  </Section>
  <Section title="Code Blocks" hlevel="2">
    <Code language="typescript">interface Test {
  name: string;
}</Code>
    <Code language="python">def hello():
    print("Hello")</Code>
  </Section>
  <Section title="About the Project" hlevel="2">
    <Content>Project info</Content>
    <Section title="About Development" hlevel="3">
      <Content>Dev info</Content>
    </Section>
  </Section>
  <Section title="Getting Started (Quick Guide)" hlevel="2">
    <Content>This section has a title with parentheses</Content>
  </Section>
</Document>`;

beforeEach(() => {
  // Reset path mock between tests
  const mock = vi.mocked(pathModule);
  pathTestUtils.resetMocks(mock);

  // Clear any existing mocks
  clearMocks();
  
  // Add mock directories
  addMockFile('/Users/adam/dev/meld/test/_tmp', '');
  addMockFile('/Users/adam/dev/meld/test/_tmp/home', '');
  addMockFile('/Users/adam/dev/meld/test/_tmp/project', '');
  
  // Add markdown fixtures
  addMockFile(pathModule.join(process.cwd(), 'src/__fixtures__/markdown/basic.md'), basicMd);
  addMockFile(pathModule.join(process.cwd(), 'src/__fixtures__/markdown/complex.md'), complexMd);
  addMockFile(pathModule.join(process.cwd(), 'src/__fixtures__/markdown/edge-cases.md'), edgeCasesMd);

  // Add XML fixtures
  addMockFile(pathModule.join(process.cwd(), 'src/__fixtures__/xml/expected/basic.xml'), basicXml);
  addMockFile(pathModule.join(process.cwd(), 'src/__fixtures__/xml/expected/complex.xml'), complexXml);

  // Add real-world fixtures
  addMockFile(pathModule.join(process.cwd(), 'src/__fixtures__/real-world/architecture.md'), basicMd);
}); 