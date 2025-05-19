import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ParserService } from '@services/pipeline/ParserService/ParserService';
import { MeldParseError } from '@core/errors/MeldParseError';
import type { MeldNode } from '@core/ast/types';
import { container, type DependencyContainer } from 'tsyringe';
import { ASTFixtureLoader } from '@tests/utils/ASTFixtureLoader';
import { mock, mockDeep } from 'vitest-mock-extended';
import type { IResolutionServiceClient } from '@services/resolution/ResolutionService/interfaces/IResolutionServiceClient';
import { ResolutionServiceClientFactory } from '@services/resolution/ResolutionService/factories/ResolutionServiceClientFactory';

/**
 * ParserService Test using AST Fixtures
 * -------------------------------------
 * 
 * This test file validates the parser's output against the expected AST structures
 * defined in core/ast/fixtures. These fixtures serve as ground truth for AST stability.
 */

describe('ParserService with AST Fixtures', () => {
  let service: ParserService;
  let testContainer: DependencyContainer;
  let mockResolutionClient: IResolutionServiceClient;
  let mockResolutionClientFactory: ResolutionServiceClientFactory;
  let fixtureLoader: ASTFixtureLoader;

  beforeEach(async () => {
    testContainer = container.createChildContainer();
    
    // Initialize the fixture loader
    fixtureLoader = new ASTFixtureLoader();
    
    // --- Mocks & Real Instances --- 
    mockResolutionClient = mock<IResolutionServiceClient>();
    mockResolutionClientFactory = {
        createClient: vi.fn().mockReturnValue(mockResolutionClient)
    } as unknown as ResolutionServiceClientFactory;
    
    // --- Registration ---
    testContainer.registerInstance(ResolutionServiceClientFactory, mockResolutionClientFactory);
    testContainer.registerInstance('DependencyContainer', testContainer);
    
    // Register the service under test
    testContainer.register(ParserService, { useClass: ParserService });

    // --- Resolve --- 
    service = testContainer.resolve(ParserService);
  });
  
  afterEach(async () => {
    testContainer?.dispose();
    vi.clearAllMocks();
  });

  /**
   * Helper function to normalize AST for comparison
   * Removes volatile properties like nodeId and exact locations that might vary
   */
  function normalizeAST(ast: MeldNode[]): any[] {
    return JSON.parse(JSON.stringify(ast, (key, value) => {
      // Remove nodeId as it's generated and will differ
      if (key === 'nodeId') return undefined;
      // Remove exact location offsets that may vary
      if (key === 'location' && typeof value === 'object') {
        // Keep only the structure to validate the AST shape
        return {
          start: {
            line: value.start?.line,
            column: value.start?.column
          },
          end: {
            line: value.end?.line, 
            column: value.end?.column
          }
        };
      }
      // Remove offset as it can vary
      if (key === 'offset') return undefined;
      return value;
    }));
  }

  describe('parse with AST fixtures', () => {
    /**
     * Helper to compare parsed results with fixture expectations
     * Handles cases where fixtures contain multiple nodes
     */
    async function validateFixtureParsingForKind(
      fixture: any,
      expectedKind: string,
      expectedSubtype?: string
    ) {
      const fixtureName = fixture.name;
      try {
        // Parse the input
        const parsedResult = await service.parse(fixture.input);
        
        // For debugging - log what we got
        if (parsedResult.length !== fixture.ast.length) {
          console.log(`Fixture ${fixtureName}: parsed ${parsedResult.length} nodes, expected ${fixture.ast.length}`);
        }
        
        // Look for a directive of the expected kind in the parsed result
        const relevantDirective = parsedResult.find(node => 
          node.type === 'Directive' && node.kind === expectedKind
        );
        
        // Ensure we found at least one directive of the expected kind
        expect(relevantDirective).toBeDefined();
        
        if (relevantDirective) {
          expect(relevantDirective).toMatchObject({
            type: 'Directive',
            kind: expectedKind
          });
          if (expectedSubtype) {
            expect(relevantDirective.subtype).toBe(expectedSubtype);
          }
        }
        
        // Basic structural check - just ensure we have the same types of nodes
        const parsedTypes = parsedResult.map(node => node.type);
        const expectedTypes = fixture.ast.map((node: any) => node.type);
        
        // Check that we have the expected node types (not necessarily in the same order for some fixtures)
        expect(parsedTypes.sort()).toEqual(expectedTypes.sort());
        
      } catch (error) {
        console.error(`Fixture ${fixtureName} failed:`, error.message);
        throw new Error(`Failed on fixture ${fixtureName}: ${error}`);
      }
    }
    
    it('should parse all text assignment fixtures correctly', async () => {
      const textAssignmentFixtures = fixtureLoader.getFixturesByKindAndSubtype('text', 'textAssignment');
      
      for (const fixture of textAssignmentFixtures) {
        await validateFixtureParsingForKind(fixture, 'text', 'textAssignment');
      }
    });

    it('should parse all text template fixtures correctly', async () => {
      const textTemplateFixtures = fixtureLoader.getFixturesByKindAndSubtype('text', 'textTemplate');
      
      for (const fixture of textTemplateFixtures) {
        await validateFixtureParsingForKind(fixture, 'text', 'textTemplate');
      }
    });

    it('should parse all data fixtures correctly', async () => {
      const dataFixtures = fixtureLoader.getFixturesByKind('data');
      
      for (const fixture of dataFixtures) {
        await validateFixtureParsingForKind(fixture, 'data');
      }
    });

    it('should parse all path fixtures correctly', async () => {
      const pathFixtures = fixtureLoader.getFixturesByKind('path');
      
      for (const fixture of pathFixtures) {
        await validateFixtureParsingForKind(fixture, 'path');
      }
    });

    it('should parse all run fixtures correctly', async () => {
      const runFixtures = fixtureLoader.getFixturesByKind('run');
      
      for (const fixture of runFixtures) {
        await validateFixtureParsingForKind(fixture, 'run');
      }
    });

    it('should parse all import fixtures correctly', async () => {
      const importFixtures = fixtureLoader.getFixturesByKind('import');
      
      for (const fixture of importFixtures) {
        await validateFixtureParsingForKind(fixture, 'import');
      }
    });

    it('should parse all exec fixtures correctly', async () => {
      const execFixtures = fixtureLoader.getFixturesByKind('exec');
      
      for (const fixture of execFixtures) {
        await validateFixtureParsingForKind(fixture, 'exec');
      }
    });

    it('should parse all add fixtures correctly', async () => {
      const addFixtures = fixtureLoader.getFixturesByKind('add');
      
      for (const fixture of addFixtures) {
        await validateFixtureParsingForKind(fixture, 'add');
      }
    });

    it('should handle parseWithLocations with fixtures', async () => {
      // Test with a specific fixture that includes location data
      const fixture = fixtureLoader.getFixture('text-assignment-1');
      if (!fixture) {
        throw new Error('text-assignment-1 fixture not found');
      }
      
      const filePath = 'test.meld';
      const parsedResult = await service.parseWithLocations(fixture.input, filePath);
      
      // Check that all nodes have the file path in their location
      parsedResult.forEach(node => {
        expect(node.location).toBeDefined();
        expect(node.location.filePath).toBe(filePath);
      });
      
      // Check the structure matches the fixture
      expect(parsedResult[0]).toMatchObject({
        type: 'Directive',
        kind: 'text',
        subtype: 'textAssignment'
      });
    });

    it('should generate statistics for fixture coverage', async () => {
      const stats = fixtureLoader.getStats();
      
      console.log('Fixture Coverage Stats:');
      console.log(`Total fixtures: ${stats.total}`);
      console.log('By directive kind:');
      for (const [kind, count] of Object.entries(stats.byKind)) {
        console.log(`  ${kind}: ${count}`);
      }
      console.log('By subtype:');
      for (const [subtype, count] of Object.entries(stats.bySubtype)) {
        console.log(`  ${subtype}: ${count}`);
      }
      
      // Ensure we have good coverage
      expect(stats.total).toBeGreaterThan(20);
      expect(stats.byKind['text']).toBeGreaterThan(0);
      expect(stats.byKind['data']).toBeGreaterThan(0);
      expect(stats.byKind['path']).toBeGreaterThan(0);
      expect(stats.byKind['run']).toBeGreaterThan(0);
      expect(stats.byKind['import']).toBeGreaterThan(0);
      expect(stats.byKind['exec']).toBeGreaterThan(0);
      expect(stats.byKind['add']).toBeGreaterThan(0);
    });
  });

  describe('error handling with fixtures', () => {
    it('should handle fixtures marked with expectError', async () => {
      const errorFixtures = fixtureLoader.getErrorFixtures();
      
      if (errorFixtures.length === 0) {
        console.log('No error fixtures found, skipping error tests');
        return;
      }
      
      for (const fixture of errorFixtures) {
        await expect(service.parse(fixture.input))
          .rejects
          .toThrow(MeldParseError);
      }
    });
  });
});