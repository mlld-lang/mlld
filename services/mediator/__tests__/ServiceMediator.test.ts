import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ServiceMediator } from '../ServiceMediator.js';
import { IServiceMediator } from '../IServiceMediator.js';

// Create mock services
const createMockParserService = () => ({
  parse: vi.fn().mockResolvedValue([{ type: 'Text', content: 'test' }]),
  parseWithLocations: vi.fn().mockResolvedValue([{ type: 'Text', content: 'test', location: {} }])
});

const createMockResolutionService = () => ({
  resolveInContext: vi.fn().mockResolvedValue('resolved value'),
  resolveText: vi.fn().mockResolvedValue('resolved text'),
  validateResolution: vi.fn().mockResolvedValue(undefined)
});

const createMockFileSystemService = () => ({
  exists: vi.fn().mockResolvedValue(true),
  isDirectory: vi.fn().mockResolvedValue(false)
});

const createMockPathService = () => ({
  resolvePath: vi.fn().mockReturnValue('/resolved/path'),
  normalizePath: vi.fn().mockReturnValue('/normalized/path')
});

const createMockStateService = () => ({
  getTextVar: vi.fn().mockReturnValue('text value'),
  getDataVar: vi.fn().mockReturnValue({ prop: 'data value' }),
  getPathVar: vi.fn().mockReturnValue('/path/value'),
  getAllTextVars: vi.fn().mockReturnValue(new Map([['key', 'value']])),
  getAllDataVars: vi.fn().mockReturnValue(new Map([['key', { prop: 'value' }]])),
  getAllPathVars: vi.fn().mockReturnValue(new Map([['key', '/path/value']]))
});

describe('ServiceMediator', () => {
  let mediator: IServiceMediator;
  let mockParserService: ReturnType<typeof createMockParserService>;
  let mockResolutionService: ReturnType<typeof createMockResolutionService>;
  let mockFileSystemService: ReturnType<typeof createMockFileSystemService>;
  let mockPathService: ReturnType<typeof createMockPathService>;
  let mockStateService: ReturnType<typeof createMockStateService>;

  beforeEach(() => {
    mediator = new ServiceMediator();
    mockParserService = createMockParserService();
    mockResolutionService = createMockResolutionService();
    mockFileSystemService = createMockFileSystemService();
    mockPathService = createMockPathService();
    mockStateService = createMockStateService();

    // Register all services with the mediator
    mediator.setParserService(mockParserService);
    mediator.setResolutionService(mockResolutionService);
    mediator.setFileSystemService(mockFileSystemService);
    mediator.setPathService(mockPathService);
    mediator.setStateService(mockStateService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Parser ↔ Resolution mediation', () => {
    it('should forward resolveVariableForParser calls to resolution service', async () => {
      const result = await mediator.resolveVariableForParser('{{var}}', { strict: true });
      expect(result).toBe('resolved value');
      expect(mockResolutionService.validateResolution).toHaveBeenCalledWith('{{var}}', { strict: true });
      expect(mockResolutionService.resolveInContext).toHaveBeenCalledWith('{{var}}', { strict: true });
    });

    it('should forward parseForResolution calls to parser service', async () => {
      const result = await mediator.parseForResolution('content', 'file.meld');
      expect(result).toEqual([{ type: 'Text', content: 'test' }]);
      expect(mockParserService.parse).toHaveBeenCalledWith('content', 'file.meld');
    });

    it('should forward parseWithLocationsForResolution calls to parser service', async () => {
      const result = await mediator.parseWithLocationsForResolution('content', 'file.meld');
      expect(result).toEqual([{ type: 'Text', content: 'test', location: {} }]);
      expect(mockParserService.parseWithLocations).toHaveBeenCalledWith('content', 'file.meld');
    });
  });

  describe('FileSystem ↔ Path mediation', () => {
    it('should forward resolvePath calls to path service', () => {
      const result = mediator.resolvePath('/path/to/resolve');
      expect(result).toBe('/resolved/path');
      expect(mockPathService.resolvePath).toHaveBeenCalledWith('/path/to/resolve');
    });

    it('should forward normalizePath calls to path service', () => {
      const result = mediator.normalizePath('/path/to/normalize');
      expect(result).toBe('/normalized/path');
      expect(mockPathService.normalizePath).toHaveBeenCalledWith('/path/to/normalize');
    });

    it('should forward isDirectory calls to filesystem service', async () => {
      const result = await mediator.isDirectory('/path/to/check');
      expect(result).toBe(false);
      expect(mockFileSystemService.isDirectory).toHaveBeenCalledWith('/path/to/check');
    });

    it('should forward exists calls to filesystem service', async () => {
      const result = await mediator.exists('/path/to/check');
      expect(result).toBe(true);
      expect(mockFileSystemService.exists).toHaveBeenCalledWith('/path/to/check');
    });
  });

  describe('State ↔ Resolution mediation', () => {
    it('should forward getTextVar calls to state service', () => {
      const result = mediator.getTextVar('greeting');
      expect(result).toBe('text value');
      expect(mockStateService.getTextVar).toHaveBeenCalledWith('greeting');
    });

    it('should forward getDataVar calls to state service', () => {
      const result = mediator.getDataVar('user');
      expect(result).toEqual({ prop: 'data value' });
      expect(mockStateService.getDataVar).toHaveBeenCalledWith('user');
    });

    it('should forward getPathVar calls to state service', () => {
      const result = mediator.getPathVar('config');
      expect(result).toBe('/path/value');
      expect(mockStateService.getPathVar).toHaveBeenCalledWith('config');
    });

    it('should forward getAllTextVars calls to state service', () => {
      const result = mediator.getAllTextVars();
      expect(result).toEqual(new Map([['key', 'value']]));
      expect(mockStateService.getAllTextVars).toHaveBeenCalled();
    });

    it('should forward getAllDataVars calls to state service', () => {
      const result = mediator.getAllDataVars();
      expect(result).toEqual(new Map([['key', { prop: 'value' }]]));
      expect(mockStateService.getAllDataVars).toHaveBeenCalled();
    });

    it('should forward getAllPathVars calls to state service', () => {
      const result = mediator.getAllPathVars();
      expect(result).toEqual(new Map([['key', '/path/value']]));
      expect(mockStateService.getAllPathVars).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should throw an error when attempting to use an uninitialized service', async () => {
      // Create a new mediator without initialized services
      const emptyMediator = new ServiceMediator();
      
      // Test parser service methods
      await expect(emptyMediator.parseForResolution('content')).rejects.toThrow('ParserService not initialized');
      await expect(emptyMediator.parseWithLocationsForResolution('content')).rejects.toThrow('ParserService not initialized');
      
      // Test resolution service methods
      await expect(emptyMediator.resolveVariableForParser('var', { strict: true })).rejects.toThrow('ResolutionService not initialized');
      
      // Test file system service methods
      await expect(emptyMediator.exists('/path')).rejects.toThrow('FileSystemService not initialized');
      await expect(emptyMediator.isDirectory('/path')).rejects.toThrow('FileSystemService not initialized');
      
      // Test path service methods
      expect(() => emptyMediator.resolvePath('/path')).toThrow('PathService not initialized');
      expect(() => emptyMediator.normalizePath('/path')).toThrow('PathService not initialized');
      
      // Test state service methods
      expect(() => emptyMediator.getTextVar('var')).toThrow('StateService not initialized');
      expect(() => emptyMediator.getDataVar('var')).toThrow('StateService not initialized');
      expect(() => emptyMediator.getPathVar('var')).toThrow('StateService not initialized');
      expect(() => emptyMediator.getAllTextVars()).toThrow('StateService not initialized');
      expect(() => emptyMediator.getAllDataVars()).toThrow('StateService not initialized');
      expect(() => emptyMediator.getAllPathVars()).toThrow('StateService not initialized');
    });
  });
});