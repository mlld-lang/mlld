# Shadow Environment Test

## Basic Shadow Environment

Define helper functions:

@exec double(x) = @run js [(x * 2)]
@exec triple(x) = @run js [(x * 3)]

Declare shadow environment:

@exec js = { double, triple }

Use functions within JS context:

@exec calculate(n) = @run js [(
  const a = double(n);
  const b = triple(n);
  return a + b;
)]

@data result = @calculate(5)
@add `Result: @result`

## Multiple Functions

@exec formatNumber(n) = @run js [(n.toFixed(2))]
@exec addPrefix(text, prefix) = @run js [(prefix + text)]

@exec js = { formatNumber, addPrefix }

@exec process(value) = @run js [(
  const formatted = formatNumber(value);
  return addPrefix(formatted, "$");
)]

@data price = @process(42.567)
@add `Price: @price`