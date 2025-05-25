// Pattern: path-section.peggy
// Purpose: Bracketed path section pattern for section extraction
// Used by: add.peggy, text.peggy
// Note: This file assumes helpers is available from peg$imports

// Bracketed path section pattern
// Matches: [path/to/file.md # Section Title]
BracketedPathSection "bracketed path with section"
  = '[' _ path:PathContent _ '#' _ section:SectionTitle _ ']' {
      helpers.debug('BracketedPathSection matched', { path, section });
      return {
        path: path,
        section: section,
        type: 'bracketedSection'
      };
    }

// Path content before the # separator
// Allows any characters except # and ]
PathContent "path content"
  = chars:$([^#\]]+ { return text(); }) {
      return chars.trim();
    }

// Section title after the # separator
// Allows any characters except ]
SectionTitle "section title"
  = chars:$([^\]]+ { return text(); }) {
      return chars.trim();
    }