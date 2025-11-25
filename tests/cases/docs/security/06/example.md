/guard @noShell before op:run = when [
  * => deny "Shell access disabled"
]

/run { ls }                                # Blocked