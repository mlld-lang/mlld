/guard @noShell before op:run = when [
  * => deny "Shell disabled in production"
]