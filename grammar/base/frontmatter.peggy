// FRONTMATTER SUPPORT
// YAML frontmatter at the beginning of documents

// Check if we're at the very start of the document
DocumentStart
  = &{ return offset() === 0; }

// Frontmatter block (must be at document start)
Frontmatter "YAML frontmatter"
  = DocumentStart "---" HWS LineTerminator content:FrontmatterContent "---" HWS LineTerminator? {
      return helpers.createNode(NodeType.Frontmatter, {
        content: content,
        location: location()
      });
    }

// Frontmatter content (everything between --- markers)
FrontmatterContent
  = lines:(!FrontmatterEnd line:FrontmatterLine { return line; })* {
      return lines.join('');
    }

// Single line of frontmatter
FrontmatterLine
  = chars:[^\n]* LineTerminator {
      return chars.join('') + '\n';
    }

// Frontmatter end marker
FrontmatterEnd
  = "---" HWS LineTerminator