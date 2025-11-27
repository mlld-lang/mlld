# Guard compares structured pipeline input to plain text correctly

/guard @structuredCheck before retryable = when [
  @input == "ok" => allow
  * => deny "mismatch"
]

/exe retryable @seed() = js { return "ok"; }
/exe @echo(value) = js { return value; }

/var retryable @value = @seed() with { pipeline: [@echo] }
/show `value: @value`
