/**
 * Snapshot generation utilities for AST nodes
 */
import * as path from 'path';
import type { DirectiveNode } from '../parse.js';
import type { IFileSystemAdapter } from '../explorer.js';
import { nodeFsAdapter } from '../fs-adapter.js';

/**
 * Create a snapshot file for a directive
 */
export function generateSnapshot(
  node: DirectiveNode,
  name: string,
  outputDir: string,
  fileSystem?: IFileSystemAdapter
): string {
  // Use provided fileSystem or fallback to fs
  const fsAdapter = fileSystem || nodeFsAdapter;

  console.log('SNAPSHOT: Using adapter to write file');
  console.log('SNAPSHOT: FileSystem adapter provided:', fileSystem ? 'yes' : 'no');
  console.log('SNAPSHOT: FileSystem adapter type:', fileSystem ? typeof fileSystem : 'none');
  console.log('SNAPSHOT: FileSystem adapter constructor:', fileSystem ? fileSystem.constructor.name : 'none');
  console.log('SNAPSHOT: Output directory:', outputDir);

  if (fileSystem) {
    // Print adapter type and methods
    console.log('SNAPSHOT: Adapter methods:', Object.keys(fileSystem).join(', '));

    // Create a test file to verify the adapter works
    try {
      fileSystem.writeFileSync(
        path.join(outputDir, '_test_write.txt'),
        'Test write from within snapshot.ts'
      );
      console.log('SNAPSHOT: Test file write succeeded');
    } catch (error) {
      console.log('SNAPSHOT: Test file write failed:', error);
    }
  }

  // Ensure output directory exists
  try {
    fsAdapter.mkdirSync(outputDir, { recursive: true });
  } catch (error) {
    console.log('SNAPSHOT: Error creating directory', error);
  }

  // Create snapshot file path
  const snapshotPath = path.join(outputDir, `${name}.snapshot.json`);

  // Write snapshot to file
  try {
    fsAdapter.writeFileSync(
      snapshotPath,
      JSON.stringify(node, null, 2)
    );
    console.log('SNAPSHOT: Wrote snapshot to', snapshotPath);
  } catch (error) {
    console.log('SNAPSHOT: Error writing snapshot', error);
  }

  return snapshotPath;
}

/**
 * Compare node with existing snapshot
 * Returns true if snapshot matches, false if different
 */
export function compareWithSnapshot(
  node: DirectiveNode, 
  name: string, 
  snapshotDir: string,
  fileSystem?: IFileSystemAdapter
): boolean {
  // Use provided fileSystem or fallback to fs
  const fsAdapter = fileSystem || nodeFsAdapter;
  
  const snapshotPath = path.join(snapshotDir, `${name}.snapshot.json`);
  
  // Check if snapshot exists
  if (!fsAdapter.existsSync(snapshotPath)) {
    return false;
  }
  
  // Read existing snapshot
  const snapshot = JSON.parse(fsAdapter.readFileSync(snapshotPath, 'utf8'));
  
  // Compare structures
  // Note: This is a simple string-based comparison
  // For more complex comparisons, implement a dedicated diff function
  return JSON.stringify(node) === JSON.stringify(snapshot);
}

/**
 * Generate a diff between a node and its snapshot
 */
export function generateSnapshotDiff(
  node: DirectiveNode, 
  name: string, 
  snapshotDir: string,
  fileSystem?: IFileSystemAdapter
): SnapshotDiff | null {
  // Use provided fileSystem or fallback to fs
  const fsAdapter = fileSystem || nodeFsAdapter;
  
  const snapshotPath = path.join(snapshotDir, `${name}.snapshot.json`);
  
  // Check if snapshot exists
  if (!fsAdapter.existsSync(snapshotPath)) {
    return null;
  }
  
  // Read existing snapshot
  const snapshot = JSON.parse(fsAdapter.readFileSync(snapshotPath, 'utf8')) as DirectiveNode;
  
  // Compare structures
  const diff: SnapshotDiff = {
    name,
    matches: JSON.stringify(node) === JSON.stringify(snapshot),
    differences: []
  };
  
  // Compare basic properties
  if (node.kind !== snapshot.kind) {
    diff.differences.push({
      path: 'kind',
      expected: snapshot.kind,
      actual: node.kind
    });
  }
  
  if (node.subtype !== snapshot.subtype) {
    diff.differences.push({
      path: 'subtype',
      expected: snapshot.subtype,
      actual: node.subtype
    });
  }
  
  // Compare values
  compareObjects('values', node.values, snapshot.values, diff.differences);
  
  // Compare raw
  compareObjects('raw', node.raw, snapshot.raw, diff.differences);
  
  // Compare meta
  compareObjects('meta', node.meta, snapshot.meta, diff.differences);
  
  return diff;
}

/**
 * Compare objects and add differences to the differences array
 */
function compareObjects(
  path: string, 
  obj1: Record<string, any>, 
  obj2: Record<string, any>,
  differences: DiffItem[]
): void {
  const keys1 = Object.keys(obj1 || {});
  const keys2 = Object.keys(obj2 || {});
  
  // Find keys that exist in obj2 but not in obj1
  keys2.filter(k => !keys1.includes(k)).forEach(k => {
    differences.push({
      path: `${path}.${k}`,
      expected: obj2[k],
      actual: undefined,
      type: 'missing'
    });
  });
  
  // Find keys that exist in obj1 but not in obj2
  keys1.filter(k => !keys2.includes(k)).forEach(k => {
    differences.push({
      path: `${path}.${k}`,
      expected: undefined,
      actual: obj1[k],
      type: 'extra'
    });
  });
  
  // Compare values for common keys
  keys1.filter(k => keys2.includes(k)).forEach(k => {
    const val1 = obj1[k];
    const val2 = obj2[k];
    
    // For arrays, compare length and contents
    if (Array.isArray(val1) && Array.isArray(val2)) {
      if (val1.length !== val2.length) {
        differences.push({
          path: `${path}.${k}.length`,
          expected: val2.length,
          actual: val1.length,
          type: 'value'
        });
      }
      
      // Could add more detailed array comparison here
      return;
    }
    
    // For objects, recurse
    if (
      typeof val1 === 'object' && val1 !== null &&
      typeof val2 === 'object' && val2 !== null
    ) {
      compareObjects(`${path}.${k}`, val1, val2, differences);
      return;
    }
    
    // For primitive values, compare directly
    if (val1 !== val2) {
      differences.push({
        path: `${path}.${k}`,
        expected: val2,
        actual: val1,
        type: 'value'
      });
    }
  });
}

/**
 * Interface for snapshot comparison result
 */
export interface SnapshotDiff {
  name: string;
  matches: boolean;
  differences: DiffItem[];
}

/**
 * Interface for a difference item
 */
export interface DiffItem {
  path: string;
  expected: any;
  actual: any;
  type?: 'missing' | 'extra' | 'value';
}