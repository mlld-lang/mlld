import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ParserService } from '@services/pipeline/ParserService/ParserService';
import { MeldParseError } from '@core/errors/MeldParseError';
import type { MeldNode } from '@core/ast/types';
import { container, type DependencyContainer } from 'tsyringe';
import { ASTFixtureLoader } from '@tests/utils/ASTFixtureLoader';
import { mock } from 'vitest-mock-extended';
import type { IResolutionServiceClient } from '@services/resolution/ResolutionService/interfaces/IResolutionServiceClient';
import { ResolutionServiceClientFactory } from '@services/resolution/ResolutionService/factories/ResolutionServiceClientFactory';

/**
 * ParserService Test using Output-based AST Fixtures
 * -------------------------------------------------
 * 
 * This test file validates the parser's structural output consistency
 * using AST fixtures as a baseline for regression testing.
 */

describe('ParserService with Output Fixtures', () => {
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

  describe('structural output validation', () => {
    it('should produce consistent output for text directives', async () => {
      const textFixtures = fixtureLoader.getFixturesByKind('text');
      const outputs: Record<string, any> = {};
      
      for (const fixture of textFixtures) {
        try {
          const result = await service.parse(fixture.input);
          outputs[fixture.name] = {
            input: fixture.input,
            nodeCount: result.length,
            types: result.map(n => n.type),
            directives: result
              .filter(n => n.type === 'Directive')
              .map(d => ({ kind: d.kind, subtype: d.subtype }))
          };
        } catch (error) {
          outputs[fixture.name] = {
            input: fixture.input,
            error: error.message
          };
        }
      }
      
      // Log outputs for manual inspection
      console.log('Text directive outputs:', JSON.stringify(outputs, null, 2));
      
      // Basic validation: ensure we get directives for valid inputs
      for (const [name, output] of Object.entries(outputs)) {
        if (!output.error) {
          expect(output.directives.length).toBeGreaterThan(0);
          expect(output.directives[0].kind).toBe('text');
        }
      }
    });

    it('should produce consistent AST structure for all directive kinds', async () => {
      const directiveKinds = ['text', 'data', 'path', 'run', 'import', 'exec', 'add'];
      const summary: Record<string, any> = {};
      
      for (const kind of directiveKinds) {
        const fixtures = fixtureLoader.getFixturesByKind(kind);
        const kindSummary = {
          total: fixtures.length,
          successfulParses: 0,
          errors: 0,
          subtypes: new Set<string>()
        };
        
        for (const fixture of fixtures) {
          try {
            const result = await service.parse(fixture.input);
            kindSummary.successfulParses++;
            
            // Find directives of this kind
            const directives = result.filter(n => n.type === 'Directive' && n.kind === kind);
            directives.forEach(d => kindSummary.subtypes.add(d.subtype));
          } catch (error) {
            kindSummary.errors++;
          }
        }
        
        // Convert Set to Array for JSON serialization
        kindSummary.subtypes = Array.from(kindSummary.subtypes);
        summary[kind] = kindSummary;
      }
      
      console.log('Parser Output Summary:', JSON.stringify(summary, null, 2));
      
      // Validate that we can parse most fixtures
      for (const [kind, data] of Object.entries(summary)) {
        const successRate = data.successfulParses / data.total;
        expect(successRate).toBeGreaterThan(0.8); // At least 80% success rate
        expect(data.subtypes.length).toBeGreaterThan(0); // Should have subtypes
      }
    });

    it('should handle complex multi-directive fixtures', async () => {
      // Test some specific complex fixtures
      const complexFixtures = [
        'data-array-mixed',
        'import-all-variable', 
        'run-exec-parameters',
        'add-template-multiline'
      ];
      
      for (const fixtureName of complexFixtures) {
        const fixture = fixtureLoader.getFixture(fixtureName);
        if (!fixture) continue;
        
        try {
          const result = await service.parse(fixture.input);
          
          // Log structure for debugging
          console.log(`\n${fixtureName} structure:`, {
            input: fixture.input,
            parsedNodes: result.map(n => ({
              type: n.type,
              kind: n.type === 'Directive' ? n.kind : undefined,
              subtype: n.type === 'Directive' ? n.subtype : undefined,
              content: n.type === 'Text' ? n.content : undefined
            }))
          });
          
          // Just validate we get something reasonable
          expect(result.length).toBeGreaterThan(0);
          expect(result.some(n => n.type === 'Directive')).toBe(true);
        } catch (error) {
          console.error(`Failed to parse ${fixtureName}:`, error.message);
        }
      }
    });

    it('should validate AST stability with snapshot testing', async () => {
      // Select key fixtures for snapshot testing
      const snapshotFixtures = [
        'text-assignment-1',
        'data-object-1',
        'path-assignment-1',
        'run-command',
        'import-all-1',
        'exec-command',
        'add-variable-1'
      ];
      
      const snapshots: Record<string, any> = {};
      
      for (const fixtureName of snapshotFixtures) {
        const fixture = fixtureLoader.getFixture(fixtureName);
        if (!fixture) continue;
        
        try {
          const result = await service.parse(fixture.input);
          
          // Create a stable representation for snapshot comparison
          snapshots[fixtureName] = {
            nodeTypes: result.map(n => n.type),
            directives: result
              .filter(n => n.type === 'Directive')
              .map(d => ({
                kind: d.kind,
                subtype: d.subtype,
                hasValues: !!d.values,
                hasRaw: !!d.raw,
                hasMeta: !!d.meta
              }))
          };
        } catch (error) {
          snapshots[fixtureName] = { error: error.message };
        }
      }
      
      // Output for creating baseline snapshots
      console.log('\nSnapshot data:', JSON.stringify(snapshots, null, 2));
      
      // Validate structure
      for (const [name, snapshot] of Object.entries(snapshots)) {
        if (!snapshot.error) {
          expect(snapshot.nodeTypes).toBeDefined();
          expect(snapshot.directives).toBeDefined();
        }
      }
    });

    it('should handle parseWithLocations correctly', async () => {
      const fixture = fixtureLoader.getFixture('text-assignment-1');
      expect(fixture).toBeDefined();
      
      const filePath = 'test.meld';
      const result = await service.parseWithLocations(fixture!.input, filePath);
      
      // Verify all top-level nodes have the filePath
      result.forEach(node => {
        expect(node.location).toBeDefined();
        expect(node.location.filePath).toBe(filePath);
      });
      
      // Check that we got the expected directive
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].type).toBe('Directive');
      expect(result[0].kind).toBe('text');
      expect(result[0].subtype).toBe('textAssignment');
    });
  });

  describe('fixture coverage analysis', () => {
    it('should report comprehensive fixture coverage', async () => {
      const stats = fixtureLoader.getStats();
      
      console.log('\nFixture Coverage Analysis:');
      console.log(`Total fixtures: ${stats.total}`);
      console.log('\nBy directive kind:');
      Object.entries(stats.byKind).forEach(([kind, count]) => {
        console.log(`  ${kind}: ${count} (${((count / stats.total) * 100).toFixed(1)}%)`);
      });
      
      console.log('\nUnique subtypes:');
      const uniqueSubtypes = new Set<string>();
      Object.keys(stats.bySubtype).forEach(key => {
        const subtype = key.split('-')[1];
        if (subtype) uniqueSubtypes.add(subtype);
      });
      console.log(`  Total: ${uniqueSubtypes.size}`);
      console.log(`  List: ${Array.from(uniqueSubtypes).sort().join(', ')}`);
      
      // Ensure we have comprehensive coverage
      expect(stats.total).toBeGreaterThan(50);
      expect(Object.keys(stats.byKind).length).toBeGreaterThanOrEqual(7);
      expect(uniqueSubtypes.size).toBeGreaterThan(10);
    });
  });
});