/**
 * @package
 * File output service for state visualizations.
 * 
 * Provides functionality to write state visualizations to files
 * instead of console output, which is useful for large visualizations
 * and for keeping test output clean.
 */

import fs from 'fs';
import path from 'path';
import { serviceLogger } from '@core/utils/logger.js';

/**
 * Configuration for file output service
 */
export interface FileOutputConfig {
  /**
   * Base directory for outputs (defaults to './logs/state-visualization')
   */
  outputDir?: string;
  
  /**
   * Automatic timestamping of filenames (defaults to true)
   */
  addTimestamps?: boolean;
  
  /**
   * File extension to use for outputs (defaults to extension based on format)
   */
  fileExtension?: string;
}

/**
 * Output formats that can be written to files
 */
export type FileOutputFormat = 'mermaid' | 'dot' | 'json' | 'text' | 'html';

/**
 * Service for writing state visualizations to files
 */
export class StateVisualizationFileOutput {
  private outputDir: string;
  private addTimestamps: boolean;
  
  /**
   * Create a new file output service
   * @param config - Configuration options
   */
  constructor(config: FileOutputConfig = {}) {
    this.outputDir = config.outputDir || './logs/state-visualization';
    this.addTimestamps = config.addTimestamps !== false; // Default to true
    
    // Ensure output directory exists
    this.ensureOutputDirectory();
  }
  
  /**
   * Write visualization data to a file
   * @param data - The visualization data
   * @param filename - Base filename (without extension)
   * @param format - The format of the data
   * @returns Path to the written file or null if failed
   */
  public writeToFile(data: string, filename: string, format: FileOutputFormat): string | null {
    try {
      // Ensure output directory exists
      this.ensureOutputDirectory();
      
      // Generate full filename with timestamp if enabled
      const fullFilename = this.generateFilename(filename, format);
      const filePath = path.join(this.outputDir, fullFilename);
      
      // Write the content
      fs.writeFileSync(filePath, this.formatContent(data, format));
      
      serviceLogger.debug('State visualization written to file', { filePath });
      return filePath;
    } catch (error) {
      serviceLogger.error('Failed to write state visualization to file', { filename, format, error });
      return null;
    }
  }
  
  /**
   * Write a wrapped HTML visualization for Mermaid diagrams
   * @param data - The Mermaid content
   * @param filename - Base filename
   * @param title - Optional title for the HTML page
   * @returns Path to the written file or null if failed
   */
  public writeMermaidHtml(data: string, filename: string, title?: string): string | null {
    try {
      // Format as HTML with Mermaid integration
      const htmlContent = this.generateMermaidHtml(data, title);
      
      // Write to file
      const fullFilename = this.generateFilename(filename, 'html');
      const filePath = path.join(this.outputDir, fullFilename);
      
      fs.writeFileSync(filePath, htmlContent);
      
      serviceLogger.debug('Mermaid visualization written to HTML file', { filePath });
      return filePath;
    } catch (error) {
      serviceLogger.error('Failed to write Mermaid HTML visualization', { filename, error });
      return null;
    }
  }
  
  /**
   * Clear all visualization files from the output directory
   * @returns Success indicator
   */
  public clearOutputDirectory(): boolean {
    try {
      if (fs.existsSync(this.outputDir)) {
        const files = fs.readdirSync(this.outputDir);
        
        files.forEach(file => {
          const filePath = path.join(this.outputDir, file);
          fs.unlinkSync(filePath);
        });
        
        serviceLogger.debug('Cleared state visualization output directory', { outputDir: this.outputDir });
      }
      return true;
    } catch (error) {
      serviceLogger.error('Failed to clear state visualization output directory', { error });
      return false;
    }
  }
  
  /**
   * Ensure the output directory exists
   * @private
   */
  private ensureOutputDirectory(): void {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }
  
  /**
   * Generate a filename with optional timestamp
   * @private
   */
  private generateFilename(baseFilename: string, format: FileOutputFormat): string {
    // Add timestamp if configured
    let filename = baseFilename;
    if (this.addTimestamps) {
      const timestamp = new Date().toISOString().replace(/[:.-]/g, '_').replace('T', '_');
      filename = `${baseFilename}_${timestamp}`;
    }
    
    // Add extension based on format
    const extension = this.getExtensionForFormat(format);
    return `${filename}.${extension}`;
  }
  
  /**
   * Get the appropriate file extension for a format
   * @private
   */
  private getExtensionForFormat(format: FileOutputFormat): string {
    switch (format) {
      case 'mermaid':
        return 'mmd';
      case 'dot':
        return 'dot';
      case 'json':
        return 'json';
      case 'html':
        return 'html';
      case 'text':
      default:
        return 'txt';
    }
  }
  
  /**
   * Format content based on the output format
   * @private
   */
  private formatContent(data: string, format: FileOutputFormat): string {
    switch (format) {
      case 'json':
        // Pretty-print JSON if it isn't already
        try {
          const parsed = JSON.parse(data);
          return JSON.stringify(parsed, null, 2);
        } catch {
          // If parsing fails, return as is
          return data;
        }
      case 'mermaid':
        // Add comment header for Mermaid
        return `# Mermaid Diagram\n# Generated: ${new Date().toISOString()}\n\n${data}`;
      case 'dot':
        // Add comment header for DOT
        return `// DOT Graph\n// Generated: ${new Date().toISOString()}\n\n${data}`;
      default:
        return data;
    }
  }
  
  /**
   * Generate HTML wrapper for Mermaid diagram
   * @private
   */
  private generateMermaidHtml(mermaidCode: string, title?: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title || 'State Visualization'}</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background-color: white;
      padding: 20px;
      border-radius: 5px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h1 {
      color: #333;
      border-bottom: 1px solid #eee;
      padding-bottom: 10px;
    }
    .timestamp {
      color: #666;
      font-size: 0.8em;
      margin-top: -10px;
      margin-bottom: 20px;
    }
    .mermaid {
      margin: 20px 0;
      overflow: auto;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${title || 'State Visualization'}</h1>
    <div class="timestamp">Generated: ${new Date().toLocaleString()}</div>
    <div class="mermaid">
${mermaidCode}
    </div>
  </div>
  <script>
    mermaid.initialize({
      startOnLoad: true,
      theme: 'default',
      logLevel: 3,
      securityLevel: 'loose',
      flowchart: { curve: 'basis' },
      gantt: { axisFormat: '%m/%d/%Y' },
      sequence: { actorMargin: 50 },
    });
  </script>
</body>
</html>`;
  }
}