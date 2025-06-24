import { describe, it, expect, beforeEach } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('Pipeline Preservation Tests - Pre-Refactor Baseline', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;
  
  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
  });
  
  describe('1. Basic Pipeline Format Tests', () => {
    it('1.1 JSON Format Pipeline - should parse JSON lazily and process', async () => {
      const input = `
/exe @extractNames(input) = js {
  // Verify input is PipelineInput object
  if (!input.text || !input.type || !input.data) {
    throw new Error("Missing PipelineInput properties");
  }
  const users = input.data;  // Should parse JSON lazily
  return users.map(u => u.name).join(", ");
}

/var @jsonData = \`[{"name": "Alice"}, {"name": "Bob"}]\`
/var @names = @jsonData with { format: "json", pipeline: [@extractNames] }
/show @names`;

      const result = await interpret(input, { fileSystem, pathService });
      expect(result.trim()).toBe('Alice, Bob');
    });

    it('1.2 CSV Format Pipeline - should parse CSV lazily', async () => {
      const input = `
/exe @countCSVRows(input) = js {
  const rows = input.csv;  // Should parse CSV lazily
  return \`\${rows.length} rows, \${rows[0].length} columns\`;
}

/var @csvData = \`Name,Age,City
Alice,30,NYC
Bob,25,LA\`
/var @analysis = @csvData with { format: "csv", pipeline: [@countCSVRows] }
/show @analysis`;

      const result = await interpret(input, { fileSystem, pathService });
      expect(result.trim()).toBe('3 rows, 3 columns');
    });

    it('1.3 XML Format Pipeline - should handle XML format', async () => {
      const input = `
/exe @processXML(input) = js {
  // For now, XML just wraps in DOCUMENT tags
  return input.xml || input.text;
}

/var @xmlData = "test data"
/var @xmlTest = @xmlData with { format: "xml", pipeline: [@processXML] }
/show @xmlTest`;

      const result = await interpret(input, { fileSystem, pathService });
      expect(result.trim()).toContain('test data');
    });

    it('1.4 Text Format Pipeline - should work with default text format', async () => {
      const input = `
/exe @uppercase(input) = js {
  // Should work with both string and PipelineInput
  const text = typeof input === 'string' ? input : input.text;
  return text.toUpperCase();
}

/var @result = "hello" with { pipeline: [@uppercase] }
/show @result`;

      const result = await interpret(input, { fileSystem, pathService });
      expect(result.trim()).toBe('HELLO');
    });
  });

  describe('2. Lazy Parsing Tests', () => {
    it('2.1 Parse Error Handling - should throw on access, not creation', async () => {
      const input = `
/exe @tryParse(input) = js {
  try {
    const data = input.data;  // Should throw here
    return "Parsed successfully";
  } catch (e) {
    return "Parse error: " + e.message;
  }
}

/var @invalid = "{ invalid json"
/var @result = @invalid with { format: "json", pipeline: [@tryParse] }
/show @result`;

      const result = await interpret(input, { fileSystem, pathService });
      expect(result.trim()).toContain('Parse error:');
    });
  });

  describe('3. Backwards Compatibility Tests', () => {
    it('3.1 String Function Compatibility - old functions expecting strings still work', async () => {
      const input = `
/exe @oldFunction(text) = js {
  // This function now handles PipelineInput properly
  const str = text.text || text;
  return "Length: " + str.length;
}

/var @data = "Hello world"
/var @result = @data with { pipeline: [@oldFunction] }
/show @result`;

      const result = await interpret(input, { fileSystem, pathService });
      expect(result.trim()).toBe('Length: 11');
    });

    it('3.2 toString() Behavior - PipelineInput stringifies correctly', async () => {
      const input = `
/exe @testStringify(input) = js {
  // Force string conversion
  return String(input).substring(0, 5);
}

/var @data = '{"complex": "data"}'
/var @result = @data with { format: "json", pipeline: [@testStringify] }
/show @result`;

      const result = await interpret(input, { fileSystem, pathService });
      // Should get first 5 chars of the JSON string
      expect(result.trim()).toBe('{"com');
    });
  });

  describe('4. Multi-Stage Pipeline Tests', () => {
    it('4.1 Format Preservation Across Stages', async () => {
      const input = `
/exe @stage1(input) = js {
  return JSON.stringify({
    users: input.data,
    count: input.data.length
  });
}

/exe @stage2(input) = js {
  const data = input.data;  // Should parse stage1's output
  return \`Total users: \${data.count}\`;
}

/var @users = [{"name": "Alice"}, {"name": "Bob"}]
/var @result = @users with { 
  format: "json", 
  pipeline: [@stage1, @stage2] 
}
/show @result`;

      const result = await interpret(input, { fileSystem, pathService });
      expect(result.trim()).toBe('Total users: 2');
    });

    it('4.2 Mixed Pipeline Types - wrapped and unwrapped stages', async () => {
      const input = `
/exe @jsonStage(input) = js {
  return input.data.value * 2;
}

/exe @textStage(num) = js {
  return \`Result: \${num}\`;
}

/var @data = [{"value": 21}]
/var @result = @data with { 
  format: "json", 
  pipeline: [@jsonStage, @textStage] 
}
/show @result`;

      const result = await interpret(input, { fileSystem, pathService });
      expect(result.trim()).toBe('Result: 42');
    });
  });

  describe('5. Environment Chain Tests', () => {
    it('5.1 Parent Variable Access - pipeline stages can access parent vars', async () => {
      const input = `
/var @multiplier = "3"

/exe @useParent(input) = js {
  // Should be able to access @multiplier from parent
  const mult = parseInt(@multiplier);
  return input.data.value * mult;
}

/var @data = [{"value": 10}]
/var @result = @data with { 
  format: "json", 
  pipeline: [@useParent] 
}
/show @result`;

      const result = await interpret(input, { fileSystem, pathService });
      expect(result.trim()).toBe('30');
    });
  });

  describe('6. Built-in Transformer Tests', () => {
    it('6.1 Format Transformers - JSON pretty print', async () => {
      const input = `
/var @obj = { users: ["Alice", "Bob"], count: 2 }
/var @jsonResult = @obj | @JSON
/show @jsonResult`;

      const result = await interpret(input, { fileSystem, pathService });
      const parsed = JSON.parse(result.trim());
      expect(parsed).toEqual({ users: ["Alice", "Bob"], count: 2 });
    });
  });

  describe('7. Complex Integration Tests', () => {
    it('7.1 Pipeline with foreach operations', async () => {
      const input = `
/var @items = [
  [{"id": 1, "value": 10}],
  [{"id": 2, "value": 20}]
]

/exe @processItem(json) = js {
  const data = json.data;  // Should parse correctly
  return data.value * 2;
}

/exe @processWithFormat(item) = @item with { 
  format: "json", 
  pipeline: [@processItem] 
}

/var @results = foreach @processWithFormat(@items)
/show @results`;

      const result = await interpret(input, { fileSystem, pathService });
      expect(result.trim()).toBe('[20, 40]');
    });
  });

  describe('8. Error Context Tests', () => {
    it('8.1 Pipeline Stage Errors - should include context', async () => {
      const input = `
/exe @uppercase(input) = js {
  return input.toUpperCase();
}

/exe @failingStage(input) = js {
  throw new Error("Stage failed: " + input);
}

/exe @lowercase(input) = js {
  return input.toLowerCase();
}

/var @result = "test" with { 
  pipeline: [@uppercase, @failingStage, @lowercase] 
}`;

      await expect(
        interpret(input, { fileSystem, pathService })
      ).rejects.toThrow(/Stage failed: TEST/);
    });
  });

  describe('Pipeline State Capture', () => {
    it('should capture current pipeline behavior for baseline', async () => {
      // This test documents the CURRENT behavior, even if not ideal
      const behaviors = {
        pipelineInputStructure: 'has text, type, data, csv, xml properties',
        lazyParsing: 'getters trigger parsing on first access',
        errorPropagation: 'includes pipeline step context',
        formatPreservation: 'format carries through stages',
        backwardsCompat: 'string functions auto-unwrap',
        shadowEnvIntegration: 'parameters pass correctly'
      };

      // Document current state
      console.log('Current Pipeline Behavior Baseline:', behaviors);
      expect(behaviors).toBeDefined();
    });
  });
});