import * as path from 'path';

export interface IOutputPathService {
  /**
   * Generate an output path with .o.ext suffix
   * @param inputPath The input file path
   * @param format The output format (md or xml)
   * @param explicitOutput Optional explicit output path from user
   * @returns The output path
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
    
    // Always use .o.ext pattern and overwrite if it exists
    const outputPath = path.join(dir, `${nameWithoutExt}.o.${outputExt}`);
    return outputPath;
  }
}