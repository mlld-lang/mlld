import fs from 'fs/promises';
import path from 'path';

export async function captureError(error: Error, source: string, filePath: string): Promise<string> {
  const id = await getNextCaptureId();
  const dir = path.join('errors', 'captured', id);
  
  await fs.mkdir(dir, { recursive: true });
  
  // Save the input that caused the error
  await fs.writeFile(path.join(dir, 'input.mld'), source);
  
  // Save error context
  const context = {
    error: {
      message: error.message,
      name: error.name,
      stack: error.stack,
      location: (error as any).location as unknown,
      found: (error as any).found as unknown,
      expected: (error as any).expected as unknown
    },
    filePath,
    timestamp: new Date().toISOString()
  };
  
  await fs.writeFile(
    path.join(dir, 'context.json'), 
    JSON.stringify(context, null, 2)
  );
  
  // Copy the pattern template
  await fs.copyFile(
    path.join('errors', 'templates', 'pattern.ts'),
    path.join(dir, 'pattern.ts')
  );
  
  // Create a simple example.md file
  await fs.writeFile(
    path.join(dir, 'example.md'),
    `# Error Pattern: ${id}\n\n## Input\n\`\`\`mld\n${source}\n\`\`\`\n\n## Error\n\`\`\`\n${error.message}\n\`\`\`\n`
  );
  
  return dir;
}

async function getNextCaptureId(): Promise<string> {
  const captureDir = path.join('errors', 'captured');
  
  try {
    await fs.access(captureDir);
  } catch {
    // Directory doesn't exist, this is the first capture
    return '001';
  }
  
  const entries = await fs.readdir(captureDir);
  const ids = entries
    .filter(e => /^\d{3}$/.test(e))
    .map(e => parseInt(e, 10))
    .sort((a, b) => b - a);
  
  const nextId = ids.length > 0 ? ids[0] + 1 : 1;
  return nextId.toString().padStart(3, '0');
}