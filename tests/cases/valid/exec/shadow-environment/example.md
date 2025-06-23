# Shadow Environment Test

## Basic Shadow Environment

Define helper functions:

/exe @double(x) = js {x * 2}
/exe @triple(x) = js {x * 3}

Declare shadow environment:

/exe js = { double, triple }

Use functions within JS context:

/exe @calculate(n) = js {
  const a = double(n);
  const b = triple(n);
  return a + b;
}

/var @result = @calculate(5)
/show `Result: @result`

## Multiple Functions

/exe @formatNumber(n) = js {n.toFixed(2)}
/exe @addPrefix(text, prefix) = js {prefix + text}

/exe js = { formatNumber, addPrefix }

/exe @process(value) = js {
  const formatted = formatNumber(value);
  return addPrefix(formatted, "$");
}

/var @price = @process(42.567)
/show `Price: @price`