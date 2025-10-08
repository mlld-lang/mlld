import { describe, it, expect, beforeEach, vi } from 'vitest';
import { processContentLoader } from './content-loader';
import { Environment } from '../env/Environment';
import { isLoadContentResultURL } from '@core/types/load-content';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { unwrapStructuredForTest } from './test-helpers';
import { isStructuredExecEnabled } from '../utils/structured-exec';
import type { StructuredValueMetadata } from '../utils/structured-value';

function expectLoadContentMetadata(metadata?: StructuredValueMetadata): void {
  if (!isStructuredExecEnabled()) {
    return;
  }
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
      
      expect(isLoadContentResultURL(result)).toBe(true);
      if (isLoadContentResultURL(result)) {
        // Basic properties
        expect(result.url).toBe('https://example.com');
        expect(result.domain).toBe('example.com');
        expect(result.status).toBe(200);
        expect(result.contentType).toBe('text/html; charset=utf-8');
        
        // Extracted metadata
        expect(result.title).toBe('Example Page');
        expect(result.description).toBe('Example description');
        
        // Content variations
        expect(result.html).toBe(mockResponse.content);
        expect(result.text).toContain('Example'); // HTML stripped
        // Content should be converted to markdown for HTML URLs
        expect(result.content).toContain('Example Page');
        expect(result.content).toContain('# Example');
        
        // Headers
        expect(result.headers).toEqual(mockResponse.headers);
      }
      expectLoadContentMetadata(metadata);
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
      const { data: result } = unwrapStructuredForTest(rawResult);
      
      if (isLoadContentResultURL(result)) {
        expect(result.contentType).toBe('application/json');
        expect(result.json).toEqual(mockJsonData);
        expect(result.html).toBeUndefined(); // Not HTML
        expect(result.md).toBeUndefined(); // Not HTML
      }
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
      const { data: result } = unwrapStructuredForTest(rawResult);
      
      if (isLoadContentResultURL(result)) {
        expect(result.title).toBe('OG Test');
        expect(result.description).toBe('OG description');
      }
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
      const { data: result } = unwrapStructuredForTest<string>(rawResult);
      
      // With section extraction, should return plain string
      expect(typeof result).toBe('string');
      expect(result).toContain('Install instructions');
      expect(result).not.toContain('Usage instructions');
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
      
      if (isLoadContentResultURL(result)) {
        // Script and style should be removed
        expect(result.text).not.toContain('console.log');
        expect(result.text).not.toContain('color: red');
        
        // HTML entities should be decoded
        expect(result.text).toContain('This is & test with <special> chars "quoted"');
        
        // Tags should be removed but content preserved
        expect(result.text).toContain('Header');
      }
    });
  });
});
