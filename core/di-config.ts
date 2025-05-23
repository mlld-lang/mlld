import 'reflect-metadata';
import { container } from 'tsyringe';

// Import only the essential services we still need
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService';
import { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem';
import { PathService } from '@services/fs/PathService/PathService';
import { logger as mainLogger } from '@core/utils/logger';

// Register the minimal set of services needed
// File system
container.register('IFileSystem', { useClass: NodeFileSystem });
container.register('IFileSystemService', { useClass: FileSystemService });
container.register('FileSystemService', { useClass: FileSystemService });

// Path service
container.register('IPathService', { useClass: PathService });
container.register('PathService', { useClass: PathService });

// Logger
container.registerInstance('MainLogger', mainLogger);
container.register('ILogger', { useToken: 'MainLogger' });

// That's it! No more complex service initialization