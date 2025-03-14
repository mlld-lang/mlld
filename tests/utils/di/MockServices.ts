/**
 * This file contains DI-compatible mock service implementations
 * These are used by TestContainerHelper and TestContextDI to provide
 * injectable mock services for tests.
 */

import { injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { vi } from 'vitest';
import type { MeldNode } from '@core/syntax/types.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';

/**
 * Injectable mock validation service
 */
@injectable()
@Service('MockValidationService for testing')
export class MockValidationService implements IValidationService {
  validate = vi.fn(async () => {});
  registerValidator = vi.fn(() => {});
  removeValidator = vi.fn(() => {});
  hasValidator = vi.fn(() => false);
  getRegisteredDirectiveKinds = vi.fn(() => []);
  getAllValidators = vi.fn(() => []);

  constructor() {
    // Default implementations
    this.validate.mockImplementation(async () => {});
    this.registerValidator.mockImplementation(() => {});
    this.removeValidator.mockImplementation(() => {});
    this.hasValidator.mockImplementation(() => false);
    this.getRegisteredDirectiveKinds.mockImplementation(() => []);
    this.getAllValidators.mockImplementation(() => []);
  }
}

/**
 * Injectable mock state service
 */
@injectable()
@Service('MockStateService for testing')
export class MockStateService implements IStateService {
  setTextVar = vi.fn();
  getTextVar = vi.fn();
  setDataVar = vi.fn();
  getDataVar = vi.fn();
  setPathVar = vi.fn();
  getPathVar = vi.fn();
  setCommand = vi.fn();
  getCommand = vi.fn();
  appendContent = vi.fn();
  getContent = vi.fn();
  createChildState = vi.fn();
  getParentState = vi.fn();
  isImmutable = vi.fn();
  makeImmutable = vi.fn();
  clone = vi.fn();
  mergeStates = vi.fn();
  getAllTextVars = vi.fn();
  getAllDataVars = vi.fn();
  getAllPathVars = vi.fn();
  getAllCommands = vi.fn();
  getNodes = vi.fn();
  addNode = vi.fn();
  getTransformedNodes = vi.fn();
  transformNode = vi.fn();
  isTransformationEnabled = vi.fn();
  enableTransformation = vi.fn();
  addImport = vi.fn();
  removeImport = vi.fn();
  hasImport = vi.fn();
  getImports = vi.fn();
  getCurrentFilePath = vi.fn();
  setCurrentFilePath = vi.fn();
  hasLocalChanges = vi.fn();
  getLocalChanges = vi.fn();
  setImmutable = vi.fn();
  mergeChildState = vi.fn();
  getStateId = vi.fn();
  getCurrentStateId = vi.fn();
  getState = vi.fn();
  reset = vi.fn();

  constructor() {
    // Default implementations
    this.setTextVar.mockImplementation(() => {});
    this.getTextVar.mockImplementation(() => '');
    this.setDataVar.mockImplementation(() => {});
    this.getDataVar.mockImplementation(() => null);
    this.setPathVar.mockImplementation(() => {});
    this.getPathVar.mockImplementation(() => '');
    this.setCommand.mockImplementation(() => {});
    this.getCommand.mockImplementation(() => '');
    this.appendContent.mockImplementation(() => {});
    this.getContent.mockImplementation(() => '');
    this.createChildState.mockImplementation(() => 'child-state-id');
    this.getParentState.mockImplementation(() => undefined);
    this.isImmutable.mockImplementation(() => false);
    this.makeImmutable.mockImplementation(() => {});
    this.setImmutable.mockImplementation(() => {});
    this.getAllTextVars.mockImplementation(() => new Map());
    this.getAllDataVars.mockImplementation(() => new Map());
    this.getAllPathVars.mockImplementation(() => new Map());
    this.getAllCommands.mockImplementation(() => new Map());
    this.getNodes.mockImplementation(() => []);
    this.addNode.mockImplementation(() => {});
    this.getTransformedNodes.mockImplementation(() => []);
    this.isTransformationEnabled.mockImplementation(() => false);
    this.enableTransformation.mockImplementation(() => {});
    this.addImport.mockImplementation(() => {});
    this.removeImport.mockImplementation(() => {});
    this.hasImport.mockImplementation(() => false);
    this.getImports.mockImplementation(() => new Set());
    this.getCurrentFilePath.mockImplementation(() => null);
    this.setCurrentFilePath.mockImplementation(() => {});
    this.hasLocalChanges.mockImplementation(() => false);
    this.getLocalChanges.mockImplementation(() => []);
    this.getStateId.mockImplementation(() => 'mock-state-id');
    this.getCurrentStateId.mockImplementation(() => 'mock-state-id');
    this.getState.mockImplementation(() => null);
    this.reset.mockImplementation(() => {});

    // Enhanced implementations
    this.clone.mockImplementation(() => this);
    this.mergeChildState.mockImplementation((childState) => {});
    this.transformNode.mockImplementation((original, transformed) => {});
  }
}

/**
 * Injectable mock resolution service
 */
@injectable()
@Service('MockResolutionService for testing')
export class MockResolutionService implements IResolutionService {
  resolveInContext = vi.fn();
  resolveContent = vi.fn();
  resolvePath = vi.fn();
  resolveCommand = vi.fn();
  resolveText = vi.fn();
  resolveData = vi.fn();
  validateResolution = vi.fn();
  extractSection = vi.fn();

  constructor() {
    // Default implementations
    this.resolveInContext.mockImplementation(async (value) => value);
    this.resolveContent.mockImplementation(async (nodes) => nodes.map(n => n.type === 'Text' ? n.content : '').join(''));
    this.resolvePath.mockImplementation(async (path) => path);
    this.resolveCommand.mockImplementation(async (cmd) => cmd);
    this.resolveText.mockImplementation(async (text) => text);
    this.resolveData.mockImplementation(async (ref) => ref);
    this.validateResolution.mockImplementation(async () => {});
    this.extractSection.mockImplementation(async () => '');
  }
}

/**
 * Injectable mock file system service
 */
@injectable()
@Service('MockFileSystemService for testing')
export class MockFileSystemService implements IFileSystemService {
  readFile = vi.fn();
  writeFile = vi.fn();
  exists = vi.fn();
  stat = vi.fn();
  isFile = vi.fn();
  readDir = vi.fn();
  ensureDir = vi.fn();
  isDirectory = vi.fn();
  join = vi.fn();
  resolve = vi.fn();
  dirname = vi.fn();
  basename = vi.fn();
  normalize = vi.fn();
  executeCommand = vi.fn();
  getCwd = vi.fn();
  enableTestMode = vi.fn();
  disableTestMode = vi.fn();
  isTestMode = vi.fn();
  mockFile = vi.fn();
  mockDir = vi.fn();
  clearMocks = vi.fn();
  setPathService = vi.fn();
  resolvePath = vi.fn();

  constructor() {
    // Default implementations
    this.readFile.mockImplementation(async () => '');
    this.writeFile.mockImplementation(async () => {});
    this.exists.mockImplementation(async () => true);
    this.stat.mockImplementation(async () => ({}));
    this.isFile.mockImplementation(async () => true);
    this.readDir.mockImplementation(async () => []);
    this.ensureDir.mockImplementation(async () => {});
    this.isDirectory.mockImplementation(async () => false);
    this.join.mockImplementation((...paths) => paths.join('/'));
    this.resolve.mockImplementation((path) => path);
    this.dirname.mockImplementation((path) => path.split('/').slice(0, -1).join('/'));
    this.basename.mockImplementation((path) => path.split('/').pop() || '');
    this.normalize.mockImplementation((path) => path);
    this.executeCommand.mockImplementation(async () => ({ stdout: '', stderr: '' }));
    this.getCwd.mockImplementation(() => '/project');
    this.enableTestMode.mockImplementation(() => {});
    this.disableTestMode.mockImplementation(() => {});
    this.isTestMode.mockImplementation(() => true);
    this.mockFile.mockImplementation(() => {});
    this.mockDir.mockImplementation(() => {});
    this.clearMocks.mockImplementation(() => {});
    this.setPathService.mockImplementation(() => {});
    this.resolvePath.mockImplementation((path) => path);
  }
}

/**
 * Injectable mock circularity service
 */
@injectable()
@Service('MockCircularityService for testing')
export class MockCircularityService implements ICircularityService {
  beginImport = vi.fn();
  endImport = vi.fn();
  isImporting = vi.fn();
  getImportChain = vi.fn();

  constructor() {
    // Default implementations
    this.beginImport.mockImplementation(async () => {});
    this.endImport.mockImplementation(async () => {});
    this.isImporting.mockImplementation(() => false);
    this.getImportChain.mockImplementation(() => []);
  }
}

/**
 * Injectable mock parser service
 */
@injectable()
@Service('MockParserService for testing')
export class MockParserService implements IParserService {
  parse = vi.fn();
  parseWithLocations = vi.fn();

  constructor() {
    // Default implementations
    this.parse.mockImplementation(() => []);
    this.parseWithLocations.mockImplementation(() => []);
  }
}

/**
 * Injectable mock interpreter service
 */
@injectable()
@Service('MockInterpreterService for testing')
export class MockInterpreterService implements IInterpreterService {
  interpret = vi.fn();
  interpretWithContext = vi.fn();
  initialize = vi.fn();

  constructor() {
    // Default implementations
    this.interpret.mockImplementation(async () => {});
    this.interpretWithContext.mockImplementation(async () => {});
    this.initialize.mockImplementation(() => {});
  }
}

/**
 * Injectable mock path service
 */
@injectable()
@Service('MockPathService for testing')
export class MockPathService implements IPathService {
  resolvePath = vi.fn();
  normalizePath = vi.fn();
  isAbsolute = vi.fn();
  join = vi.fn();
  dirname = vi.fn();
  basename = vi.fn();
  extname = vi.fn();
  relative = vi.fn();
  setProjectPath = vi.fn();
  getProjectPath = vi.fn();
  enableTestMode = vi.fn();
  disableTestMode = vi.fn();
  isTestMode = vi.fn();

  constructor() {
    // Default implementations
    this.resolvePath.mockImplementation((path) => path);
    this.normalizePath.mockImplementation((path) => path);
    this.isAbsolute.mockImplementation(() => false);
    this.join.mockImplementation((...paths) => paths.join('/'));
    this.dirname.mockImplementation((path) => path.split('/').slice(0, -1).join('/'));
    this.basename.mockImplementation((path) => path.split('/').pop() || '');
    this.extname.mockImplementation((path) => {
      const base = path.split('/').pop() || '';
      return base.includes('.') ? '.' + base.split('.').pop() : '';
    });
    this.relative.mockImplementation((from, to) => to);
    this.setProjectPath.mockImplementation(() => {});
    this.getProjectPath.mockImplementation(() => '/project');
    this.enableTestMode.mockImplementation(() => {});
    this.disableTestMode.mockImplementation(() => {});
    this.isTestMode.mockImplementation(() => true);
  }
}

// Factory functions for creating mock services
export const mockServiceFactories = {
  createMockValidationService: () => new MockValidationService(),
  createMockStateService: () => new MockStateService(),
  createMockResolutionService: () => new MockResolutionService(),
  createMockFileSystemService: () => new MockFileSystemService(),
  createMockCircularityService: () => new MockCircularityService(),
  createMockParserService: () => new MockParserService(),
  createMockInterpreterService: () => new MockInterpreterService(),
  createMockPathService: () => new MockPathService(),
};