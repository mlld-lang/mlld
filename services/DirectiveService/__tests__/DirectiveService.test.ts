let mockValidationService: any;
let mockStateService: any;
let mockPathService: any;
let mockFileSystemService: any;
let mockParserService: any;
let mockInterpreterService: any;
let mockCircularityService: any;

beforeEach(() => {
  // Create mock services
  mockValidationService = {
    validate: vi.fn()
  };

  mockStateService = {
    setTextVar: vi.fn(),
    setDataVar: vi.fn(),
    createChildState: vi.fn(),
    mergeChildState: vi.fn()
  };

  mockPathService = {
    resolvePath: vi.fn()
  };

  mockFileSystemService = {
    exists: vi.fn(),
    readFile: vi.fn()
  };

  mockParserService = {
    parse: vi.fn()
  };

  mockInterpreterService = {
    interpret: vi.fn()
  };

  mockCircularityService = {
    beginImport: vi.fn(),
    endImport: vi.fn()
  };

  // Create service instance
  service = new DirectiveService();
  service.initialize(
    mockValidationService,
    mockStateService,
    mockPathService,
    mockFileSystemService,
    mockParserService,
    mockInterpreterService,
    mockCircularityService
  );
});

describe('Import directive handling', () => {
  it('should process a valid import directive', async () => {
    const node: DirectiveNode = {
      type: 'directive',
      directive: {
        kind: 'import',
        path: 'test.md'
      } as ImportDirective,
      location: { start: { line: 1, column: 1 } }
    };

    const mockContent = 'Test content';
    const mockParsedNodes = [{ type: 'text', content: 'Test content' }];
    const mockChildState = {};

    mockPathService.resolvePath.mockResolvedValue('/resolved/test.md');
    mockFileSystemService.exists.mockResolvedValue(true);
    mockFileSystemService.readFile.mockResolvedValue(mockContent);
    mockStateService.createChildState.mockResolvedValue(mockChildState);
    mockParserService.parse.mockResolvedValue(mockParsedNodes);
    mockInterpreterService.interpret.mockResolvedValue(mockChildState);

    await service.processDirective(node);

    expect(mockValidationService.validate).toHaveBeenCalledWith(node);
    expect(mockPathService.resolvePath).toHaveBeenCalledWith('test.md');
    expect(mockCircularityService.beginImport).toHaveBeenCalledWith('/resolved/test.md');
    expect(mockFileSystemService.exists).toHaveBeenCalledWith('/resolved/test.md');
    expect(mockFileSystemService.readFile).toHaveBeenCalledWith('/resolved/test.md');
    expect(mockStateService.createChildState).toHaveBeenCalled();
    expect(mockParserService.parse).toHaveBeenCalledWith(mockContent);
    expect(mockInterpreterService.interpret).toHaveBeenCalledWith(
      mockParsedNodes,
      expect.objectContaining({
        initialState: mockChildState,
        filePath: '/resolved/test.md',
        mergeState: true
      })
    );
    expect(mockCircularityService.endImport).toHaveBeenCalledWith('/resolved/test.md');
  });

  it('should handle circular imports', async () => {
    const node: DirectiveNode = {
      type: 'directive',
      directive: {
        kind: 'import',
        path: 'circular.md'
      } as ImportDirective,
      location: { start: { line: 1, column: 1 } }
    };

    mockPathService.resolvePath.mockResolvedValue('/resolved/circular.md');
    mockCircularityService.beginImport.mockImplementation(() => {
      throw new MeldImportError('Circular import detected', 'circular_import', {
        importChain: ['file1.md', 'circular.md']
      });
    });

    await expect(service.processDirective(node))
      .rejects
      .toThrow(MeldDirectiveError);

    expect(mockCircularityService.beginImport).toHaveBeenCalledWith('/resolved/circular.md');
    expect(mockCircularityService.endImport).toHaveBeenCalledWith('/resolved/circular.md');
  });
});

describe('Embed directive handling', () => {
  it('should process a valid embed directive', async () => {
    const node: DirectiveNode = {
      type: 'directive',
      directive: {
        kind: 'embed',
        path: 'test.md',
        format: 'markdown'
      } as EmbedDirective,
      location: { start: { line: 1, column: 1 } }
    };

    const mockContent = 'Test content';
    const mockParsedNodes = [{ type: 'text', content: 'Test content' }];
    const mockChildState = {};

    mockPathService.resolvePath.mockResolvedValue('/resolved/test.md');
    mockFileSystemService.exists.mockResolvedValue(true);
    mockFileSystemService.readFile.mockResolvedValue(mockContent);
    mockStateService.createChildState.mockResolvedValue(mockChildState);
    mockParserService.parse.mockResolvedValue(mockParsedNodes);
    mockInterpreterService.interpret.mockResolvedValue(mockChildState);

    await service.processDirective(node);

    expect(mockValidationService.validate).toHaveBeenCalledWith(node);
    expect(mockPathService.resolvePath).toHaveBeenCalledWith('test.md');
    expect(mockCircularityService.beginImport).toHaveBeenCalledWith('/resolved/test.md');
    expect(mockFileSystemService.exists).toHaveBeenCalledWith('/resolved/test.md');
    expect(mockFileSystemService.readFile).toHaveBeenCalledWith('/resolved/test.md');
    expect(mockStateService.createChildState).toHaveBeenCalled();
    expect(mockParserService.parse).toHaveBeenCalledWith(mockContent);
    expect(mockInterpreterService.interpret).toHaveBeenCalledWith(
      mockParsedNodes,
      expect.objectContaining({
        initialState: mockChildState,
        filePath: '/resolved/test.md',
        mergeState: true
      })
    );
    expect(mockCircularityService.endImport).toHaveBeenCalledWith('/resolved/test.md');
  });

  it('should handle circular embeds', async () => {
    const node: DirectiveNode = {
      type: 'directive',
      directive: {
        kind: 'embed',
        path: 'circular.md'
      } as EmbedDirective,
      location: { start: { line: 1, column: 1 } }
    };

    mockPathService.resolvePath.mockResolvedValue('/resolved/circular.md');
    mockCircularityService.beginImport.mockImplementation(() => {
      throw new MeldImportError('Circular import detected', 'circular_import', {
        importChain: ['file1.md', 'circular.md']
      });
    });

    await expect(service.processDirective(node))
      .rejects
      .toThrow(MeldDirectiveError);

    expect(mockCircularityService.beginImport).toHaveBeenCalledWith('/resolved/circular.md');
    expect(mockCircularityService.endImport).toHaveBeenCalledWith('/resolved/circular.md');
  });
}); 