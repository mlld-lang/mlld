# URL Escape Implementation

## Summary

We've implemented an escape mechanism for `@` symbols in URLs to prevent them from being interpreted as Meld variables.

## Escape Sequences

- `\@` - Produces a literal `@` character in URLs
- `\\` - Produces a literal `\` character in URLs

## How It Works

In the grammar file `grammar/patterns/path-expression.peggy`, the URL parsing rules now include:

```peggy
URLParts "URL parts"
  = parts:(URLEscapedBackslash / URLEscapedAt / URLVariableRef / URLSegment)+ {
      return parts;
    }

URLEscapedAt "Escaped @ in URL"
  = "\\@" {
      return helpers.createNode(NodeType.Text, { 
        content: '@', 
        location: location() 
      });
    }

URLEscapedBackslash "Escaped backslash in URL"  
  = "\\\\" {
      return helpers.createNode(NodeType.Text, { 
        content: '\\', 
        location: location() 
      });
    }
```

## Usage Examples

```meld
# Social media handles
@path twitter = https://twitter.com/\@meldproject
@path github = https://github.com/\@username

# Email in query parameters  
@path reset = https://example.com/reset?email=user\@example.com

# Literal backslashes
@path windows = https://example.com/path\\to\\file
```

## Current Status

✅ **Working**:
- Escaped `@` symbols are correctly parsed as literal text, not variables
- The `hasVariables` flag correctly shows `false` when only escaped @ are present
- URLs are still properly identified with `pathSubtype: 'urlPath'`

⚠️ **Known Issue**:
- URL segments after escaped characters may be parsed as separate small text nodes rather than being combined
- This doesn't affect functionality but may result in more AST nodes than necessary
- Example: `https://twitter.com/\@username` produces nodes: ["twitter.com/", "@", "username"] instead of ["twitter.com/", "@username"]

## Interpreter Considerations

When reconstructing URLs from the AST, the interpreter should:
1. Concatenate all consecutive Text nodes in the path
2. Preserve the literal `@` characters from escaped sequences
3. Only treat VariableReference nodes as variables to interpolate

## Testing

The escape mechanism can be tested with:

```javascript
// These should NOT have variables
@path social = https://twitter.com/\@user    // hasVariables: false
@path email = https://site.com?e=a\@b.com    // hasVariables: false

// These SHOULD have variables  
@path api = https://\@domain/api              // hasVariables: true (domain is a var)
@path user = https://site.com/users/@userId  // hasVariables: true (userId is a var)
```

## Shell Escaping Note

When testing from the command line, remember that the shell also interprets backslashes. You may need to double-escape:

```bash
# In shell, use \\\\ to get \\ which produces \
npm run ast -- '@path x = https://site.com/\\@user'
```