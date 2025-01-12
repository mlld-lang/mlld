import { Location } from 'meld-spec';
import { adjustLocation } from '../location';

describe('adjustLocation', () => {
  it('returns undefined if location is undefined', () => {
    const baseLocation: Location = {
      start: { line: 1, column: 1 },
      end: { line: 1, column: 10 }
    };
    expect(adjustLocation(undefined, baseLocation)).toBeUndefined();
  });

  it('returns undefined if baseLocation is undefined', () => {
    const location: Location = {
      start: { line: 1, column: 1 },
      end: { line: 1, column: 10 }
    };
    expect(adjustLocation(location, undefined)).toBeUndefined();
  });

  it('adjusts single-line location correctly', () => {
    const location: Location = {
      start: { line: 1, column: 5 },
      end: { line: 1, column: 10 }
    };
    const baseLocation: Location = {
      start: { line: 10, column: 3 },
      end: { line: 15, column: 1 }
    };

    const adjusted = adjustLocation(location, baseLocation);
    expect(adjusted).toEqual({
      start: { line: 10, column: 7 }, // base.line + (loc.line - 1), base.col + loc.col - 1
      end: { line: 10, column: 12 }   // base.line + (loc.line - 1), base.col + loc.col - 1
    });
  });

  it('adjusts multi-line location correctly', () => {
    const location: Location = {
      start: { line: 1, column: 5 },
      end: { line: 3, column: 10 }
    };
    const baseLocation: Location = {
      start: { line: 10, column: 3 },
      end: { line: 15, column: 1 }
    };

    const adjusted = adjustLocation(location, baseLocation);
    expect(adjusted).toEqual({
      start: { line: 10, column: 7 },  // base.line + (loc.line - 1), base.col + loc.col - 1
      end: { line: 12, column: 10 }    // base.line + (loc.line - 1), keep original column
    });
  });

  it('only adjusts column for first line', () => {
    const location: Location = {
      start: { line: 2, column: 5 },
      end: { line: 3, column: 10 }
    };
    const baseLocation: Location = {
      start: { line: 10, column: 3 },
      end: { line: 15, column: 1 }
    };

    const adjusted = adjustLocation(location, baseLocation);
    expect(adjusted).toEqual({
      start: { line: 11, column: 5 },  // base.line + (loc.line - 1), keep original column
      end: { line: 12, column: 10 }    // base.line + (loc.line - 1), keep original column
    });
  });
}); 