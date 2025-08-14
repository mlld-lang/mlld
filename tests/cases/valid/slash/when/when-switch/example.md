## Test switch-style when first with value matching
/var @configKey = "ANTHROPIC_API_KEY"

/when first [
  @configKey == "ANTHROPIC_API_KEY" => show "✓ API key configured"
  @configKey == "" => show "ERROR: Missing API key"
  * => show "Unknown key"
]

## Test none condition in when first block
/var @unknownKey = "UNKNOWN_KEY"

/when first [
  @unknownKey == "ANTHROPIC_API_KEY" => show "✓ API key configured"
  @unknownKey == "" => show "ERROR: Missing API key"
  none => show "ERROR: Unknown configuration key"
]

>> Test with matching condition - none should not execute
/var @key2 = "ANTHROPIC_API_KEY"
/when first [
  @key2 == "ANTHROPIC_API_KEY" => show "Found API key"
  none => show "No API key found"
]

>> Test with empty string
/var @key3 = ""
/when first [
  @key3 == "ANTHROPIC_API_KEY" => show "Has key"
  @key3 == "" => show "Empty key"
  none => show "Should not execute"
]