# Alligator Glob Concatenation Test

This test verifies that glob patterns concatenate content by default, consistent with single file behavior.

## Single File Behavior

# Single File

This is the content of the single file.
Content: # Single File

This is the content of the single file.
## Glob Pattern Behavior

---
title: File One
---

# File 1

Content of first file.

# File 2

Content of second file.
All files concatenated via .mx.text
## Field Access on Glob

---
title: File One
---

# File 1

Content of first file.

# File 2

Content of second file.
First file title: File One
---
title: File One
---

# File 1

Content of first file.
## Template Interpolation

Combined: ---
title: File One
---

# File 1

Content of first file.

# File 2

Content of second file.
## Direct Interpolation

Direct: ---
title: File One
---

# File 1

Content of first file.

# File 2

Content of second file.
