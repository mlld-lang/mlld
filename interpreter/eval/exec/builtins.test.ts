import { describe, expect, it } from 'vitest';
import { dispatchBuiltinMethod } from './builtins';
import { wrapStructured } from '@interpreter/utils/structured-value';

describe('dispatchBuiltinMethod', () => {
  describe('array.includes() with StructuredValue wrapper elements', () => {
    it('matches two wrappers with identical .text even when they are different instances', () => {
      const a = wrapStructured('contact:r_alice', 'text', 'contact:r_alice');
      const b = wrapStructured('contact:r_alice', 'text', 'contact:r_alice');
      expect(a).not.toBe(b);

      const { result } = dispatchBuiltinMethod({
        commandName: 'includes',
        objectValue: [a],
        evaluatedArgs: [b]
      });
      expect(result).toBe(true);
    });

    it('matches a wrapper element against a primitive needle', () => {
      const wrapped = wrapStructured('hello', 'text', 'hello');
      const { result } = dispatchBuiltinMethod({
        commandName: 'includes',
        objectValue: [wrapped],
        evaluatedArgs: ['hello']
      });
      expect(result).toBe(true);
    });

    it('matches a primitive element against a wrapper needle', () => {
      const wrapped = wrapStructured('hello', 'text', 'hello');
      const { result } = dispatchBuiltinMethod({
        commandName: 'includes',
        objectValue: ['hello'],
        evaluatedArgs: [wrapped]
      });
      expect(result).toBe(true);
    });

    it('still returns false when text does not match', () => {
      const a = wrapStructured('contact:r_alice', 'text', 'contact:r_alice');
      const b = wrapStructured('contact:r_bob', 'text', 'contact:r_bob');
      const { result } = dispatchBuiltinMethod({
        commandName: 'includes',
        objectValue: [a],
        evaluatedArgs: [b]
      });
      expect(result).toBe(false);
    });

    it('works on arrays of plain primitive elements', () => {
      const { result } = dispatchBuiltinMethod({
        commandName: 'includes',
        objectValue: ['apple', 'banana', 'cherry'],
        evaluatedArgs: ['banana']
      });
      expect(result).toBe(true);
    });
  });

  describe('array.indexOf() with StructuredValue wrapper elements', () => {
    it('returns the correct index when wrappers match by .text', () => {
      const a = wrapStructured('a', 'text', 'a');
      const b = wrapStructured('b', 'text', 'b');
      const needleB = wrapStructured('b', 'text', 'b');
      const { result } = dispatchBuiltinMethod({
        commandName: 'indexOf',
        objectValue: [a, b],
        evaluatedArgs: [needleB]
      });
      expect(result).toBe(1);
    });

    it('returns -1 when the needle is not present', () => {
      const a = wrapStructured('a', 'text', 'a');
      const needleZ = wrapStructured('z', 'text', 'z');
      const { result } = dispatchBuiltinMethod({
        commandName: 'indexOf',
        objectValue: [a],
        evaluatedArgs: [needleZ]
      });
      expect(result).toBe(-1);
    });
  });
});
