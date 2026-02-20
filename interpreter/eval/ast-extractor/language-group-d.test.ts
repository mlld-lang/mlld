import { describe, expect, it } from 'vitest';
import { extractAst } from '../ast-extractor';

function onlyResult(results: Array<{ name: string; type: string } | null>): { name: string; type: string } {
  const present = results.filter((result): result is { name: string; type: string } => result !== null);
  expect(present).toHaveLength(1);
  return present[0];
}

describe('ast extractor language group D (Solidity/Java/C#)', () => {
  it('keeps Solidity contract member extraction stable', () => {
    const source = [
      'contract Vault {',
      '  event Deposited(address indexed user);',
      '  struct Deposit { uint256 amount; }',
      '  enum State { Open, Closed }',
      '  error Unauthorized(address who);',
      '  constructor() {}',
      '  function store(uint256 amount) public {',
      '    emit Deposited(msg.sender);',
      '  }',
      '}'
    ].join('\n');

    const contractMatch = onlyResult(extractAst(source, 'vault.sol', [{ type: 'definition', name: 'Vault' }]));
    expect(contractMatch.type).toBe('contract');

    const eventMatch = onlyResult(extractAst(source, 'vault.sol', [{ type: 'definition', name: 'Deposited' }]));
    expect(eventMatch.type).toBe('event');

    const constructorMatch = onlyResult(extractAst(source, 'vault.sol', [{ type: 'definition', name: 'constructor' }]));
    expect(constructorMatch.type).toBe('constructor');

    const functionMatch = onlyResult(extractAst(source, 'vault.sol', [{ type: 'definition', name: 'store' }]));
    expect(functionMatch.type).toBe('function');
  });

  it('keeps Java class/interface/enum and member extraction stable', () => {
    const source = [
      'public class Service {',
      '  public Service() {}',
      '  public String createUser() {',
      '    return \"ok\";',
      '  }',
      '}',
      '',
      'interface Worker {',
      '  void run();',
      '}',
      '',
      'enum Mode {',
      '  READ,',
      '  WRITE',
      '}'
    ].join('\n');

    const classMatch = onlyResult(extractAst(source, 'Service.java', [{ type: 'definition', name: 'Service' }]));
    expect(classMatch.type).toBe('class');

    const methodMatch = onlyResult(extractAst(source, 'Service.java', [{ type: 'definition', name: 'createUser' }]));
    expect(methodMatch.type).toBe('method');

    const interfaceMatch = onlyResult(extractAst(source, 'Service.java', [{ type: 'definition', name: 'Worker' }]));
    expect(interfaceMatch.type).toBe('interface');

    const enumMatch = onlyResult(extractAst(source, 'Service.java', [{ type: 'definition', name: 'Mode' }]));
    expect(enumMatch.type).toBe('enum');
  });

  it('keeps C# record/class/method/variable extraction stable', () => {
    const source = [
      'public class Service {',
      '  public Service() { }',
      '  public int Build() {',
      '    return 1;',
      '  }',
      '}',
      '',
      'public static int TopCounter = 0;',
      '',
      'public interface IRunner {',
      '  void Run();',
      '}',
      '',
      'public record UserRecord(string Name);'
    ].join('\n');

    const recordMatch = onlyResult(extractAst(source, 'Service.cs', [{ type: 'definition', name: 'UserRecord' }]));
    expect(recordMatch.type).toBe('record');

    const classMatch = onlyResult(extractAst(source, 'Service.cs', [{ type: 'definition', name: 'Service' }]));
    expect(classMatch.type).toBe('class');

    const methodMatch = onlyResult(extractAst(source, 'Service.cs', [{ type: 'definition', name: 'Build' }]));
    expect(methodMatch.type).toBe('method');

    const variableMatch = onlyResult(extractAst(source, 'Service.cs', [{ type: 'definition', name: 'TopCounter' }]));
    expect(variableMatch.type).toBe('variable');

    const interfaceMatch = onlyResult(extractAst(source, 'Service.cs', [{ type: 'definition', name: 'IRunner' }]));
    expect(interfaceMatch.type).toBe('interface');
  });
});
