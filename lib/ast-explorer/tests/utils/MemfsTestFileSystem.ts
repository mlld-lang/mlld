/**
 * Mock implementation of MemfsTestFileSystem for testing
 */
import { Volume, createFsFromVolume } from 'memfs';

/**
 * In-memory file system for testing
 */
export class MemfsTestFileSystem {
  vol: Volume;
  
  constructor() {
    this.vol = Volume.fromJSON({
      '/project': null
    });
  }
  
  /**
   * Initialize the file system
   */
  initialize(): void {
    // Create basic directory structure
    this.vol.mkdirSync('/project', { recursive: true });
  }
  
  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    // Reset the volume
    this.vol = new Volume();
  }
  
  /**
   * Get an fs-like API for this volume
   */
  getFs() {
    return createFsFromVolume(this.vol);
  }
}