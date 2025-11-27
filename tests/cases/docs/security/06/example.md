/guard @noShell before op:run = when [
  * => deny "Shell access disabled"
]

/run cmd { ls }                                # Blocked