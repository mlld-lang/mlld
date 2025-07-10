import { Environment } from '@interpreter/env/Environment';
import { MlldError } from '@core/errors';
import { extractSectionFromMarkdown } from 'llmxml';

/**
 * Process content loading expressions (<file.md> syntax)
 * Loads content from files or URLs and optionally extracts sections
 */
export async function processContentLoader(node: any, env: Environment): Promise<string> {
  if (!node || node.type !== 'load-content') {
    throw new MlldError('Invalid content loader node', {
      node: node ? node.type : 'null',
      expected: 'load-content'
    });
  }

  const { source, options } = node;

  if (!source) {
    throw new MlldError('Content loader expression missing source', {
      node: node
    });
  }

  // Reconstruct the path/URL string from the source
  let pathOrUrl: string;
  if (source.type === 'path') {
    pathOrUrl = reconstructPath(source);
  } else if (source.type === 'url') {
    pathOrUrl = reconstructUrl(source);
  } else {
    throw new MlldError(`Unknown content loader source type: ${source.type}`, {
      sourceType: source.type,
      expected: ['path', 'url']
    });
  }

  try {
    // Use the unified loading approach - let Environment handle the distinction
    let content: string;
    if (env.isURL(pathOrUrl)) {
      content = await env.fetchURL(pathOrUrl);
    } else {
      // Let Environment handle path resolution and fuzzy matching
      content = await env.readFile(pathOrUrl);
    }
    
    // Extract section if specified
    if (options?.section) {
      const sectionName = await extractSectionName(options.section, env);
      return extractSection(content, sectionName, options.section.renamed);
    }
    
    return content;
  } catch (error: any) {
    throw new MlldError(`Failed to load content: ${pathOrUrl}`, {
      path: pathOrUrl,
      error: error.message
    });
  }
}

/**
 * Reconstruct path string from path AST node
 */
function reconstructPath(pathNode: any): string {
  if (!pathNode.segments || !Array.isArray(pathNode.segments)) {
    return pathNode.raw || '';
  }

  return pathNode.segments.map((segment: any) => {
    if (segment.type === 'Text') {
      return segment.content;
    } else if (segment.type === 'PathSeparator') {
      return segment.value;
    } else if (segment.type === 'VariableReference') {
      // For now, throw error - variable interpolation in paths needs env context
      throw new MlldError('Variable interpolation in content loader paths not yet implemented', {
        variable: segment.identifier
      });
    }
    return '';
  }).join('');
}

/**
 * Reconstruct URL string from URL AST node
 */
function reconstructUrl(urlNode: any): string {
  if (urlNode.raw) {
    return urlNode.raw;
  }
  
  // Reconstruct from parts
  const { protocol, host, path } = urlNode;
  return `${protocol}://${host}${path || ''}`;
}


/**
 * Extract section name from section AST node
 */
async function extractSectionName(sectionNode: any, env: Environment): Promise<string> {
  if (!sectionNode || !sectionNode.identifier) {
    throw new MlldError('Invalid section node', {
      node: sectionNode
    });
  }

  // Section identifier might be Text or could have variables
  const identifier = sectionNode.identifier;
  
  if (identifier.type === 'Text') {
    return identifier.content;
  } else if (Array.isArray(identifier)) {
    // Handle array of nodes (with potential variable interpolation)
    // For now, just concatenate text nodes
    return identifier
      .filter(node => node.type === 'Text')
      .map(node => node.content)
      .join('');
  }

  throw new MlldError('Unable to extract section name', {
    identifierType: identifier.type
  });
}

/**
 * Extract a section from markdown content
 */
function extractSection(content: string, sectionName: string, renamedTitle?: string): string {
  try {
    const extracted = extractSectionFromMarkdown(content, {
      sectionName: sectionName,
      includeHeading: true
    });

    if (!extracted) {
      throw new MlldError(`Section "${sectionName}" not found in content`, {
        sectionName: sectionName,
        availableSections: getAvailableSections(content)
      });
    }

    // If renamed, replace the heading
    if (renamedTitle) {
      const lines = extracted.split('\n');
      if (lines.length > 0 && lines[0].startsWith('#')) {
        // Preserve the heading level
        const headingMatch = lines[0].match(/^(#+)\s/);
        if (headingMatch) {
          lines[0] = `${headingMatch[1]} ${renamedTitle}`;
          return lines.join('\n');
        }
      }
    }

    return extracted;
  } catch (error: any) {
    throw new MlldError(`Failed to extract section: ${error.message}`, {
      sectionName: sectionName,
      error: error.message
    });
  }
}

/**
 * Get list of available sections in markdown content (for error messages)
 */
function getAvailableSections(content: string): string[] {
  const sections: string[] = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    const match = line.match(/^#+\s+(.+)$/);
    if (match) {
      sections.push(match[1]);
    }
  }
  
  return sections;
}