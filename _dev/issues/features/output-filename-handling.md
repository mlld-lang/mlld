# Improved Output Filename Handling

## Overview

Currently, Meld incorrectly defaults to writing output to the same filename and extension as the input file. This can potentially overwrite source files and doesn't follow best practices for processed file naming.

## Current Behavior

- When processing a .mld or .md file, the output path is typically derived by replacing the extension
- For .md input files, there's a check to prevent overwriting but only for the exact same file
- The current approach is inconsistent and doesn't establish a clear pattern for output files

## Desired Behavior

1. For `.mld` and `.md` input files:
   - Default output should always be `[filename].o.md` (for markdown output) or `[filename].o.xml` (for XML output)
   - This naming convention creates a clear distinction between source and processed files

2. Custom output handling:
   - Only use a different name if explicitly specified via the `--output` CLI argument

3. File conflict resolution:
   - If the target output file (e.g., `filename.o.md`) already exists, prompt the user if they want to overwrite it
   - If the user declines to overwrite:
     - Automatically generate an incremented filename: `filename-1.o.md`, `filename-2.o.md`, `filename-3.o.md`, etc.
     - Continue incrementing until an available filename is found

## Implementation Details

### Code Locations to Modify

1. `services/cli/CLIService/CLIService.ts`:
   - `determineOutputPath` method (lines ~425-470): Currently determines output path based on input extension
   - `confirmOverwrite` method (lines ~215-265): Handles file conflict resolution and auto-redirection
   - `findAvailableIncrementalFilename` method: Referenced in the class but not fully implemented

2. Changes to `determineOutputPath`:
   ```typescript
   // Current logic for .mld extension:
   if (inputPath.endsWith(inputExt)) {
     // Default behavior: replace .mld with the output extension
     const outputPath = inputPath.substring(0, inputPath.length - inputExt.length) + outputExt;
     
     // Only handles very specific case:
     if (outputExt === '.md' && 
         await this.fileSystemService.exists(resolvedOutputPath) && 
         resolvedOutputPath === resolvedInputPath) {
       // Add .o.md suffix to avoid overwriting
       const modifiedPath = resolvedOutputPath.replace(outputExt, '.o.md');
       logger.info(`Preventing overwrite of input file, using: ${modifiedPath}`);
       return modifiedPath;
     }
   }
   ```

   Should be changed to:
   ```typescript
   if (inputPath.endsWith(inputExt) || inputPath.endsWith('.md')) {
     // Extract the base filename without extension
     const baseName = inputPath.substring(0, inputPath.length - this.pathService.extname(inputPath).length);
     
     // Always append .o.{format} unless output explicitly specified
     const outputPath = `${baseName}.o${outputExt}`;
     
     return this.pathService.resolvePath(outputPath);
   }
   ```

3. The `confirmOverwrite` method should be simplified since we'll always use .o.{format} naming:
   ```typescript
   async confirmOverwrite(outputPath: string): Promise<{ outputPath: string; shouldOverwrite: boolean }> {
     // Check if file exists
     const exists = await this.fileSystemService.exists(outputPath);
     if (!exists) {
       return { outputPath, shouldOverwrite: true };
     }
     
     // Prompt for overwrite
     const response = await this.promptService.getText(
       `File ${outputPath} already exists. Overwrite? [Y/n] `, 
       'y'
     );
     
     if (response.toLowerCase() === 'n') {
       // Use existing incremental filename logic
       return this.findAvailableIncrementalFilename(outputPath);
     }
     
     return { outputPath, shouldOverwrite: true };
   }
   ```

4. Implement the `findAvailableIncrementalFilename` method that's already referenced in the code:
   ```typescript
   private async findAvailableIncrementalFilename(outputPath: string): Promise<{ outputPath: string; shouldOverwrite: boolean }> {
     const ext = this.pathService.extname(outputPath);
     const basePath = outputPath.slice(0, -ext.length);
     let counter = 1;
     let newPath = `${basePath}-${counter}${ext}`;
     
     while (await this.fileSystemService.exists(newPath)) {
       counter++;
       newPath = `${basePath}-${counter}${ext}`;
     }
     
     return { outputPath: newPath, shouldOverwrite: true };
   }
   ```

5. Update the help documentation to reflect the new behavior:
   - `-o, --output <path>    Output file path [default: input filename with .o.{format} extension]`

## Note on Existing Implementation

The `findAvailableIncrementalFilename` method is already referenced in the `processFile` method of the CLIService (around line 389), but it does not appear to be fully implemented in the CLIService class. There is a similar function defined in the `cli/index.ts` file, but it should be properly implemented in the CLIService class as well.

## Benefits

- Prevents accidental source file overwriting
- Creates a clear distinction between source and output files 
- Follows standard practices for processed file naming
- Provides a predictable and safe default behavior

## Implementation Priority

High - This addresses a potential data loss issue and improves user experience.

## Related Issues

- None 