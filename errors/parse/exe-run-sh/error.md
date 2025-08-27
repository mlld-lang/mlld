Shell scripts in /exe don't use 'run' keyword

Found: ${LINE}

In /exe, use shell syntax directly:
  ✗ /exe @${FUNCNAME}() = run sh { ... }
  ✅ /exe @${FUNCNAME}() = sh { ... }

The 'run' keyword is only for standalone /run directives, not within /exe definitions.