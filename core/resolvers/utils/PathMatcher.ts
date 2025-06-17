import * as path from 'path';
import { IFileSystemService } from '@services/fs/IFileSystemService';

/**
 * Configuration for fuzzy path matching
 */
export interface FuzzyMatchConfig {
  enabled?: boolean;
  caseInsensitive?: boolean;
  normalizeWhitespace?: boolean;
  suggestionThreshold?: number;
}

/**
 * Result of a fuzzy path match attempt
 */
export interface PathMatchResult {
  /**
   * The matched path (if found)
   */
  path?: string;
  
  /**
   * Whether an exact match was found
   */
  exact: boolean;
  
  /**
   * Confidence score (0-1)
   */
  confidence: number;
  
  /**
   * All potential matches (for ambiguity errors)
   */
  candidates?: PathCandidate[];
  
  /**
   * Suggested alternatives (for "did you mean?" errors)
   */
  suggestions?: string[];
}

/**
 * A candidate path with match details
 */
export interface PathCandidate {
  path: string;
  confidence: number;
  matchType: 'exact' | 'case' | 'whitespace' | 'fuzzy';
}

/**
 * Utility for fuzzy path matching with case and whitespace normalization
 */
export class PathMatcher {
  private static readonly DEFAULT_CONFIG: Required<FuzzyMatchConfig> = {
    enabled: true,
    caseInsensitive: true,
    normalizeWhitespace: true,
    suggestionThreshold: 0.7
  };

  private directoryCache: Map<string, { entries: string[], timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5000; // 5 seconds

  constructor(private fileSystem: IFileSystemService) {}

  /**
   * Find a matching path with fuzzy matching support
   */
  async findMatch(
    targetPath: string,
    basePath: string,
    config?: FuzzyMatchConfig,
    maxDepth?: number
  ): Promise<PathMatchResult> {
    const cfg = { ...PathMatcher.DEFAULT_CONFIG, ...config };
    
    // Security check: prevent path traversal
    if (targetPath.includes('..')) {
      // Don't use fuzzy matching for paths with traversal attempts
      return { exact: false, confidence: 0 };
    }
    
    // If fuzzy matching is disabled, just check exact path
    if (!cfg.enabled) {
      const fullPath = path.join(basePath, targetPath);
      const exists = await this.fileSystem.exists(fullPath);
      return {
        path: exists ? fullPath : undefined,
        exact: true,
        confidence: exists ? 1 : 0
      };
    }

    // Split path into segments for checking
    // Handle leading ./ by removing it
    const cleanPath = targetPath.startsWith('./') ? targetPath.substring(2) : targetPath;
    const segments = cleanPath.split('/').filter(s => s.length > 0);
    
    // Check max depth if specified (applies to all matches, including exact)
    // Depth is number of directories, not total segments
    // 'README.md' = depth 0, 'modules/utils.mld' = depth 1
    if (segments.length > 0 && maxDepth !== undefined) {
      const depth = Math.max(0, segments.length - 1);
      if (depth >= maxDepth) {
        // Don't use fuzzy matching for paths that exceed max depth
        return { exact: false, confidence: 0 };
      }
    }

    // Try exact match first
    const exactPath = path.join(basePath, targetPath);
    if (await this.fileSystem.exists(exactPath)) {
      return {
        path: exactPath,
        exact: true,
        confidence: 1
      };
    }
    
    // Debug log
    if (process.env.DEBUG_FUZZY) {
      console.log(`No exact match for ${exactPath}, trying fuzzy...`);
    }

    if (segments.length === 0) {
      return { exact: false, confidence: 0 };
    }

    // Recursively match path segments
    try {
      const result = await this.matchSegments(segments, basePath, cfg);
      
      // If we found multiple candidates with equal confidence, it's ambiguous
      if (result.candidates && result.candidates.length > 1) {
        const topConfidence = result.candidates[0].confidence;
        const equalMatches = result.candidates.filter(c => c.confidence === topConfidence);
        
        if (equalMatches.length > 1) {
          return {
            exact: false,
            confidence: 0,
            candidates: equalMatches
          };
        }
      }

      return result;
    } catch (error) {
      // If directory doesn't exist or other error, return no match
      return { exact: false, confidence: 0 };
    }
  }

  /**
   * Clear the directory cache
   */
  clearCache(): void {
    this.directoryCache.clear();
  }

  /**
   * Recursively match path segments with fuzzy matching
   */
  private async matchSegments(
    segments: string[],
    currentPath: string,
    config: Required<FuzzyMatchConfig>,
    depth: number = 0
  ): Promise<PathMatchResult> {
    // Debug log
    if (process.env.DEBUG_FUZZY) {
      console.log(`matchSegments: segments=${segments.join('/')}, currentPath=${currentPath}, depth=${depth}`);
    }
    
    // Base case: no more segments
    if (segments.length === 0) {
      return {
        path: currentPath,
        exact: false,
        confidence: 1
      };
    }

    const [currentSegment, ...remainingSegments] = segments;
    
    // Get directory entries (with caching)
    const entries = await this.getCachedDirectoryEntries(currentPath);
    if (!entries) {
      if (process.env.DEBUG_FUZZY) {
        console.log(`No entries found in directory: ${currentPath}`);
      }
      return { exact: false, confidence: 0 };
    }
    
    if (process.env.DEBUG_FUZZY) {
      console.log(`Directory entries: ${entries.join(', ')}`);
    }

    // Find matching entries for current segment
    const matches = await this.findSegmentMatches(
      currentSegment,
      entries,
      currentPath,
      config
    );

    if (matches.length === 0) {
      // No matches found - generate suggestions
      const suggestions = this.generateSuggestions(currentSegment, entries, config);
      
      if (process.env.DEBUG_FUZZY) {
        console.log(`No matches for segment '${currentSegment}', generated ${suggestions.length} suggestions`);
      }
      
      return {
        exact: false,
        confidence: 0,
        suggestions: suggestions.slice(0, 3) // Top 3 suggestions
      };
    }

    // If this is the last segment, return the matches
    if (remainingSegments.length === 0) {
      // Sort by confidence and match type priority
      matches.sort((a, b) => {
        if (a.confidence !== b.confidence) {
          return b.confidence - a.confidence;
        }
        // Priority: exact > case > whitespace > fuzzy
        const typePriority = { exact: 4, case: 3, whitespace: 2, fuzzy: 1 };
        return typePriority[b.matchType] - typePriority[a.matchType];
      });

      return {
        path: matches[0].path,
        exact: matches[0].matchType === 'exact',
        confidence: matches[0].confidence,
        candidates: matches.length > 1 ? matches : undefined
      };
    }

    // Recursively match remaining segments for each candidate
    const results: PathMatchResult[] = [];
    for (const match of matches) {
      const subResult = await this.matchSegments(
        remainingSegments,
        match.path,
        config,
        depth + 1
      );
      
      if (subResult.path) {
        results.push({
          ...subResult,
          confidence: match.confidence * subResult.confidence
        });
      }
    }

    if (results.length === 0) {
      return { exact: false, confidence: 0 };
    }

    // Sort by confidence
    results.sort((a, b) => b.confidence - a.confidence);
    
    // Check for ambiguity
    const topConfidence = results[0].confidence;
    const equalResults = results.filter(r => r.confidence === topConfidence);
    
    if (equalResults.length > 1) {
      return {
        exact: false,
        confidence: 0,
        candidates: equalResults.map(r => ({
          path: r.path!,
          confidence: r.confidence,
          matchType: 'fuzzy' as const
        }))
      };
    }

    return results[0];
  }

  /**
   * Find matching entries for a path segment
   */
  private async findSegmentMatches(
    segment: string,
    entries: string[],
    basePath: string,
    config: Required<FuzzyMatchConfig>
  ): Promise<PathCandidate[]> {
    const matches: PathCandidate[] = [];

    for (const entry of entries) {
      const entryPath = path.join(basePath, entry);
      
      // Check if it's a file or directory
      const stats = await this.fileSystem.stat(entryPath);
      
      // For files, check extension match first
      const entryParsed = path.parse(entry);
      const segmentParsed = path.parse(segment);
      const entryName = stats.isFile() ? entryParsed.name : entry;
      const segmentName = segmentParsed.name;
      const entryExt = entryParsed.ext;
      const segmentExt = segmentParsed.ext;
      
      // If segment has an extension, it must match exactly (case-insensitive)
      if (segmentExt && stats.isFile() && entryExt.toLowerCase() !== segmentExt.toLowerCase()) {
        continue;
      }

      // Exact match
      if (entry === segment || (stats.isFile() && entryName === segmentName)) {
        matches.push({
          path: entryPath,
          confidence: 1,
          matchType: 'exact'
        });
        continue;
      }

      // Case-insensitive match
      if (config.caseInsensitive) {
        if (entry.toLowerCase() === segment.toLowerCase() ||
            (stats.isFile() && entryName.toLowerCase() === segmentName.toLowerCase())) {
          matches.push({
            path: entryPath,
            confidence: 0.95,
            matchType: 'case'
          });
          continue;
        }
      }

      // Whitespace normalization match
      if (config.normalizeWhitespace) {
        const normalizedEntry = this.normalizeWhitespace(entryName);
        const normalizedSegment = this.normalizeWhitespace(segmentName);
        
        // Only check normalized match if not already found with higher priority
        if (normalizedEntry === normalizedSegment) {
          // Calculate confidence based on transformation distance
          const confidence = this.calculateWhitespaceConfidence(entryName, segmentName);
          matches.push({
            path: entryPath,
            confidence,
            matchType: 'whitespace'
          });
          continue;
        }

        // Case-insensitive + whitespace normalization (only if both are enabled)
        if (config.caseInsensitive && 
            normalizedEntry.toLowerCase() === normalizedSegment.toLowerCase()) {
          const confidence = this.calculateWhitespaceConfidence(entryName, segmentName) * 0.95;
          matches.push({
            path: entryPath,
            confidence,
            matchType: 'fuzzy'
          });
        }
      }
    }

    return matches;
  }

  /**
   * Normalize whitespace in a string (spaces, dashes, underscores)
   */
  private normalizeWhitespace(str: string): string {
    // Replace all whitespace variants with a single dash
    return str.replace(/[\s\-_]+/g, '-');
  }

  /**
   * Calculate confidence based on whitespace transformation
   */
  private calculateWhitespaceConfidence(original: string, target: string): number {
    // Priority: exact > dashes > underscores > spaces
    const originalChars = this.getWhitespaceChars(original);
    const targetChars = this.getWhitespaceChars(target);
    
    if (originalChars === targetChars) return 0.9;
    
    const charPriority: Record<string, number> = {
      '-': 3,
      '_': 2,
      ' ': 1,
      'mixed': 0
    };
    
    const originalPriority = charPriority[originalChars] || 0;
    const targetPriority = charPriority[targetChars] || 0;
    
    // Higher confidence if target uses higher priority separator
    const priorityDiff = Math.abs(originalPriority - targetPriority);
    return 0.9 - (priorityDiff * 0.1);
  }

  /**
   * Get the predominant whitespace character type
   */
  private getWhitespaceChars(str: string): string {
    const dashes = (str.match(/-/g) || []).length;
    const underscores = (str.match(/_/g) || []).length;
    const spaces = (str.match(/ /g) || []).length;
    
    if (dashes > 0 && underscores === 0 && spaces === 0) return '-';
    if (underscores > 0 && dashes === 0 && spaces === 0) return '_';
    if (spaces > 0 && dashes === 0 && underscores === 0) return ' ';
    return 'mixed';
  }

  /**
   * Generate suggestions for a failed match
   */
  private generateSuggestions(
    segment: string,
    entries: string[],
    config: Required<FuzzyMatchConfig>
  ): string[] {
    const suggestions: Array<{ entry: string, score: number }> = [];
    
    if (process.env.DEBUG_FUZZY) {
      console.log(`Generating suggestions for '${segment}' from entries:`, entries);
    }
    
    for (const entry of entries) {
      const score = this.calculateSimilarity(segment, entry, config);
      
      if (process.env.DEBUG_FUZZY) {
        console.log(`  ${entry}: score=${score}, threshold=${config.suggestionThreshold}`);
      }
      
      if (score >= config.suggestionThreshold) {
        suggestions.push({ entry, score });
      }
    }
    
    // Sort by score and return entry names
    return suggestions
      .sort((a, b) => b.score - a.score)
      .map(s => s.entry);
  }

  /**
   * Calculate similarity score between two strings
   */
  private calculateSimilarity(
    str1: string,
    str2: string,
    config: Required<FuzzyMatchConfig>
  ): number {
    let s1 = str1;
    let s2 = str2;
    
    if (config.normalizeWhitespace) {
      s1 = this.normalizeWhitespace(s1);
      s2 = this.normalizeWhitespace(s2);
    }
    
    if (config.caseInsensitive) {
      s1 = s1.toLowerCase();
      s2 = s2.toLowerCase();
    }
    
    // Simple Levenshtein distance-based similarity
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1;
    
    const distance = this.levenshteinDistance(s1, s2);
    return 1 - (distance / maxLen);
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(
            dp[i - 1][j],     // deletion
            dp[i][j - 1],     // insertion
            dp[i - 1][j - 1]  // substitution
          );
        }
      }
    }
    
    return dp[m][n];
  }

  /**
   * Get cached directory entries or read from filesystem
   */
  private async getCachedDirectoryEntries(dirPath: string): Promise<string[] | null> {
    const now = Date.now();
    const cached = this.directoryCache.get(dirPath);
    
    if (cached && now - cached.timestamp < this.CACHE_TTL) {
      return cached.entries;
    }
    
    try {
      const entries = await this.fileSystem.readdir(dirPath);
      this.directoryCache.set(dirPath, { entries, timestamp: now });
      return entries;
    } catch (error) {
      return null;
    }
  }
}