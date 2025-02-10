import { vi, beforeEach } from 'vitest';
import { join } from 'path';
import { addMockFile, clearMocks, FileSystemError } from '../__mocks__/fs';

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
  // Clear any existing mocks
  clearMocks();
  
  // Add markdown fixtures
  addMockFile('src/__fixtures__/markdown/basic.md', basicMd);
  addMockFile('src/__fixtures__/markdown/complex.md', complexMd);
  addMockFile('src/__fixtures__/markdown/edge-cases.md', edgeCasesMd);

  // Add XML fixtures
  addMockFile(join(process.cwd(), 'src/__fixtures__/xml/expected/basic.xml'), basicXml);
  addMockFile(join(process.cwd(), 'src/__fixtures__/xml/expected/complex.xml'), complexXml);

  // Add real-world fixtures
  addMockFile(join(process.cwd(), 'src/__fixtures__/real-world/architecture.md'), basicMd);

  // Mock path module
  vi.mock('path', () => ({
    join: vi.fn((...paths: string[]) => paths.join('/')),
    resolve: vi.fn((...paths: string[]) => paths.join('/')),
    dirname: vi.fn((p: string) => p.split('/').slice(0, -1).join('/')),
    normalize: vi.fn((p: string) => p.replace(/\\/g, '/').replace(/\/\.\//g, '/').replace(/\/[^/]+\/\.\./g, '')),
    isAbsolute: vi.fn((p: string) => p.startsWith('/'))
  }));
}); 