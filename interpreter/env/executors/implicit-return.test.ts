import { describe, expect, it } from 'vitest';
import { addImplicitReturn } from './implicit-return';

describe('addImplicitReturn', () => {
  it('adds implicit return for multiline trailing expressions', () => {
    const source = `
console.log('debug');
value * 2
`;

    const transformed = addImplicitReturn(source);

    expect(transformed).toContain("console.log('debug');");
    expect(transformed).toContain('return (value * 2);');
  });

  it('keeps code unchanged when explicit return already exists', () => {
    const source = `
console.log('debug');
return value * 2;
`;

    expect(addImplicitReturn(source)).toBe(source);
  });

  it('keeps non-expression trailing statements unchanged', () => {
    const source = `
if (flag) {
  doThing();
}
`;

    expect(addImplicitReturn(source)).toBe(source);
  });
});
