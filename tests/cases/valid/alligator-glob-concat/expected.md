# Alligator Glob Concatenation Test

This test verifies that glob patterns concatenate content by default, consistent with single file behavior.

## Single File Behavior

# Single File

This is the content of the single file.

Content: # Single File

This is the content of the single file.
## Glob Pattern Behavior

# File 1

Content of first file.

# File 2

Content of second file.

All files: # File 1

Content of first file.

# File 2

Content of second file.
## Field Access on Glob

# File 1

Content of first file.

# File 2

Content of second file.
File One
# File 1

Content of first file.
## Template Interpolation

Combined: # File 1

Content of first file.

# File 2

Content of second file.
## Direct Interpolation

Direct: # File 1

Content of first file.

# File 2

Content of second file.