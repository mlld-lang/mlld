export interface CLIOptions {
  input: string;
  output?: string;
  format?: 'md' | 'llm';
  stdout?: boolean;
}

export interface ICLIService {
  /**
   * Run the CLI with the given arguments
   * @param args Command line arguments (including node and script path)
   */
  run(args: string[]): Promise<void>;
} 