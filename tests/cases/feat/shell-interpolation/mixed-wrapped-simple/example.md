# Test: Array Mixing Strings with StructuredValue Text Wrappers

>> Tests that arrays with plain strings AND StructuredValue 'text' wrappers
>> still expand as simple arguments (both are text content)

/exe @wrap_text(val) = js { return val; }

/var @plain = "plain.txt"
/var @wrapped = @wrap_text("wrapped.txt")
/var @mixed = [@plain, @wrapped, "another.txt"]

/run { echo @mixed }
