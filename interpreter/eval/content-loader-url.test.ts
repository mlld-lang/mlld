import { describe, it, expect, beforeEach, vi } from 'vitest';
import { processContentLoader } from './content-loader';
import { Environment } from '../env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { unwrapStructuredForTest } from './test-helpers';
import type { StructuredValueMetadata } from '../utils/structured-value';

function expectLoadContentMetadata(metadata?: StructuredValueMetadata): void {
  expect(metadata?.source).toBe('load-content');
}

describe('Content Loader URL Metadata', () => {
  let env: Environment;
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
    env = new Environment(fileSystem, pathService, process.cwd());
    
    // Mock fetchURLWithMetadata
    env.fetchURLWithMetadata = vi.fn();
  });

  describe('URL Loading with Metadata', () => {
    it('should load URL and return LoadContentResultURL with metadata', async () => {
      const mockResponse = {
        content: '<!DOCTYPE html><html><head><title>Example Page</title><meta name="description" content="Example description"></head><body><h1>Example</h1></body></html>',
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'content-length': '156'
        },
        status: 200
      };
      
      (env.fetchURLWithMetadata as any).mockResolvedValue(mockResponse);
      
      const node = {
        type: 'load-content',
        source: {
          type: 'url',
          raw: 'https://example.com'
        }
      };

      const rawResult = await processContentLoader(node, env);
      const { data: result, metadata } = unwrapStructuredForTest(rawResult);
      
      expect(typeof result).toBe('string');
      expect(result).toContain('Example Page');
      expect(metadata?.url).toBe('https://example.com');
      expect(metadata?.domain).toBe('example.com');
      expect(metadata?.status).toBe(200);
      expect(metadata?.title).toBe('Example Page');
      expect(metadata?.description).toBe('Example description');
      expect(metadata?.headers).toEqual(mockResponse.headers);
      expectLoadContentMetadata(metadata);
      expect(metadata?.taint).toEqual(expect.arrayContaining(['src:network']));
      expect(metadata?.sources).toEqual(expect.arrayContaining(['https://example.com']));
    });

    it('should handle JSON URLs correctly', async () => {
      const mockJsonData = { name: 'test', value: 123 };
      const mockResponse = {
        content: JSON.stringify(mockJsonData),
        headers: {
          'content-type': 'application/json'
        },
        status: 200
      };
      
      (env.fetchURLWithMetadata as any).mockResolvedValue(mockResponse);
      
      const node = {
        type: 'load-content',
        source: {
          type: 'url',
          raw: 'https://api.example.com/data.json'
        }
      };

      const rawResult = await processContentLoader(node, env);
      const { data: result, metadata } = unwrapStructuredForTest(rawResult);
      
      expect(result).toEqual(mockJsonData);
      expect(metadata?.url).toBe('https://api.example.com/data.json');
    });

    it('should extract og:description when meta description is missing', async () => {
      const mockResponse = {
        content: '<!DOCTYPE html><html><head><title>OG Test</title><meta property="og:description" content="OG description"></head><body></body></html>',
        headers: {
          'content-type': 'text/html'
        },
        status: 200
      };
      
      (env.fetchURLWithMetadata as any).mockResolvedValue(mockResponse);
      
      const node = {
        type: 'load-content',
        source: {
          type: 'url',
          raw: 'https://example.com/og-test'
        }
      };

      const rawResult = await processContentLoader(node, env);
      const { data: result, metadata } = unwrapStructuredForTest(rawResult);
      
      expect(typeof result).toBe('string');
      expect(metadata?.title).toBe('OG Test');
      expect(metadata?.description).toBe('OG description');
    });

    it('should handle URLs with section extraction', async () => {
      const mockResponse = {
        content: '# Page Title\n\n## Installation\n\nInstall instructions\n\n## Usage\n\nUsage instructions',
        headers: {
          'content-type': 'text/markdown'
        },
        status: 200
      };
      
      (env.fetchURLWithMetadata as any).mockResolvedValue(mockResponse);
      
      const node = {
        type: 'load-content',
        source: {
          type: 'url',
          raw: 'https://example.com/docs.md'
        },
        options: {
          section: {
            identifier: { type: 'Text', content: 'Installation' }
          }
        }
      };

      const rawResult = await processContentLoader(node, env);
      const { data: result, mx } = unwrapStructuredForTest<string>(rawResult);
      
      // With section extraction, should return plain string
      expect(typeof result).toBe('string');
      expect(result).toContain('Install instructions');
      expect(result).not.toContain('Usage instructions');
      expect(mx?.taint).toEqual(expect.arrayContaining(['src:network']));
      expect(mx?.sources).toEqual(expect.arrayContaining(['https://example.com/docs.md']));
    });

    it('should strip HTML correctly for text property', async () => {
      const mockResponse = {
        content: `<!DOCTYPE html>
<html>
<head>
  <title>Test</title>
  <script>console.log('test');</script>
  <style>body { color: red; }</style>
</head>
<body>
  <h1>Header</h1>
  <p>This is &amp; test with &lt;special&gt; chars &quot;quoted&quot;.</p>
</body>
</html>`,
        headers: {
          'content-type': 'text/html'
        },
        status: 200
      };
      
      (env.fetchURLWithMetadata as any).mockResolvedValue(mockResponse);
      
      const node = {
        type: 'load-content',
        source: {
          type: 'url',
          raw: 'https://example.com'
        }
      };

      const rawResult = await processContentLoader(node, env);
      const { data: result } = unwrapStructuredForTest(rawResult);
 
      expect(typeof result).toBe('string');
      expect(result).not.toContain('console.log');
      expect(result).not.toContain('color: red');
      expect(result).toContain('This is & test with <special> chars "quoted"');
      expect(result).toContain('Header');
    });
  });
});
