import * as path from 'path';
import * as fs from 'fs/promises';

export interface IOutputPathService {
  /**
   * Generate a safe output path that won't overwrite existing files
   * @param inputPath The input file path
   * @param format The output format (md or xml)
   * @param explicitOutput Optional explicit output path from user
   * @returns The safe output path
   */
  getSafeOutputPath(inputPath: string, format: 'md' | 'xml', explicitOutput?: string): Promise<string>;
}

export class OutputPathService implements IOutputPathService {
  async getSafeOutputPath(inputPath: string, format: 'md' | 'xml', explicitOutput?: string): Promise<string> {
    // If user explicitly specified output, use that
    if (explicitOutput) {
      return explicitOutput;
    }

    // Extract components
    const dir = path.dirname(inputPath);
    const inputExt = path.extname(inputPath);
    const nameWithoutExt = path.basename(inputPath, inputExt);
    const outputExt = format === 'xml' ? 'xml' : 'md';
    
    // Start with .o.ext pattern
    let counter = 0;
    let outputPath = path.join(dir, `${nameWithoutExt}.o.${outputExt}`);
    
    // If that exists, try .o1.ext, .o2.ext, etc.
    while (await this.fileExists(outputPath)) {
      counter++;
      outputPath = path.join(dir, `${nameWithoutExt}.o${counter}.${outputExt}`);
    }
    
    return outputPath;
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}