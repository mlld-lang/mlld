let mockValidationService: any;
let mockStateService: any;
let mockPathService: any;
let mockFileSystemService: any;
let mockParserService: any;
let mockInterpreterService: any;
let mockCircularityService: any;
let mockInterpolationService: any;

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

  mockInterpolationService = {
    resolveString: vi.fn()
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
    mockCircularityService,
    mockInterpolationService
  );
});

describe('Text directive handling', () => {
  it('should process text directive', async () => {
    const node: DirectiveNode = {
      type: 'directive',
      directive: {
        kind: 'text',
        name: 'greeting',
        value: 'Hello Alice!' // Value already interpolated by meld-ast
      } as TextDirective,
      location: { start: { line: 1, column: 1 } }
    };

    await service.processDirective(node);

    expect(mockStateService.setTextVar).toHaveBeenCalledWith('greeting', 'Hello Alice!');
  });
});

describe('Data directive handling', () => {
  it('should process string data directive value', async () => {
    const node: DirectiveNode = {
      type: 'directive',
      directive: {
        kind: 'data',
        name: 'config',
        value: '{"url": "example.com"}' // Value already interpolated by meld-ast
      } as DataDirective,
      location: { start: { line: 1, column: 1 } }
    };

    await service.processDirective(node);

    expect(mockStateService.setDataVar).toHaveBeenCalledWith('config', { url: 'example.com' });
  });

  it('should process object data directive value', async () => {
    const node: DirectiveNode = {
      type: 'directive',
      directive: {
        kind: 'data',
        name: 'config',
        value: { url: 'example.com' }
      } as DataDirective,
      location: { start: { line: 1, column: 1 } }
    };

    await service.processDirective(node);

    expect(mockStateService.setDataVar).toHaveBeenCalledWith('config', { url: 'example.com' });
  });
});

describe('Import directive handling', () => {
  it('should process import directive', async () => {
    const node: DirectiveNode = {
      type: 'directive',
      directive: {
        kind: 'import',
        path: '/project/test.md', // Path already interpolated by meld-ast
        section: 'Introduction'    // Section already interpolated by meld-ast
      } as ImportDirective,
      location: { start: { line: 1, column: 1 } }
    };

    mockPathService.resolvePath.mockResolvedValue('/resolved/test.md');
    mockFileSystemService.exists.mockResolvedValue(true);
    mockFileSystemService.readFile.mockResolvedValue('content');
    mockStateService.createChildState.mockResolvedValue({});
    mockParserService.parse.mockResolvedValue([]);

    await service.processDirective(node);

    expect(mockPathService.resolvePath).toHaveBeenCalledWith('/project/test.md');
    expect(mockCircularityService.beginImport).toHaveBeenCalledWith('/resolved/test.md');
    expect(mockFileSystemService.exists).toHaveBeenCalledWith('/resolved/test.md');
    expect(mockFileSystemService.readFile).toHaveBeenCalledWith('/resolved/test.md');
    expect(mockStateService.createChildState).toHaveBeenCalled();
    expect(mockParserService.parse).toHaveBeenCalledWith(expect.any(String));
    expect(mockCircularityService.endImport).toHaveBeenCalledWith('/resolved/test.md');
  });

  it('should handle missing files', async () => {
    const node: DirectiveNode = {
      type: 'directive',
      directive: {
        kind: 'import',
        path: '/project/missing.md' // Path already interpolated by meld-ast
      } as ImportDirective,
      location: { start: { line: 1, column: 1 } }
    };

    mockPathService.resolvePath.mockResolvedValue('/resolved/missing.md');
    mockFileSystemService.exists.mockResolvedValue(false);

    await expect(service.processDirective(node))
      .rejects
      .toThrow(MeldDirectiveError);
  });

  it('should handle circular imports', async () => {
    const node: DirectiveNode = {
      type: 'directive',
      directive: {
        kind: 'import',
        path: '/project/circular.md' // Path already interpolated by meld-ast
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
  });
});

describe('Embed directive handling', () => {
  it('should process embed directive', async () => {
    const node: DirectiveNode = {
      type: 'directive',
      directive: {
        kind: 'embed',
        path: '/project/test.md',    // Path already interpolated by meld-ast
        section: 'Introduction',      // Section already interpolated by meld-ast
        format: 'markdown'
      } as EmbedDirective,
      location: { start: { line: 1, column: 1 } }
    };

    mockPathService.resolvePath.mockResolvedValue('/resolved/test.md');
    mockFileSystemService.exists.mockResolvedValue(true);
    mockFileSystemService.readFile.mockResolvedValue('content');
    mockStateService.createChildState.mockResolvedValue({});
    mockParserService.parse.mockResolvedValue([]);

    await service.processDirective(node);

    expect(mockPathService.resolvePath).toHaveBeenCalledWith('/project/test.md');
    expect(mockCircularityService.beginImport).toHaveBeenCalledWith('/resolved/test.md');
    expect(mockFileSystemService.exists).toHaveBeenCalledWith('/resolved/test.md');
    expect(mockFileSystemService.readFile).toHaveBeenCalledWith('/resolved/test.md');
    expect(mockStateService.createChildState).toHaveBeenCalled();
    expect(mockParserService.parse).toHaveBeenCalledWith(expect.any(String));
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