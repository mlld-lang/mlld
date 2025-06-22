# Shadow Environment Test

## Basic Shadow Environment

Define helper functions:

/exec @double(x) = js {x * 2}
/exec @triple(x) = js {x * 3}

Declare shadow environment:

/exec js = { double, triple }

Use functions within JS context:

/exec @calculate(n) = js {}
  const a = double(n);
  const b = triple(n);
  return a + b;
}

/data @result = @calculate(5)
/add `Result: @result`

## Multiple Functions

/exec @formatNumber(n) = js {n.toFixed(2)}
/exec @addPrefix(text, prefix) = js {prefix + text}

/exec js = { formatNumber, addPrefix }

/exec @process(value) = js {}
  const formatted = formatNumber(value);
  return addPrefix(formatted, "$");
}

/data @price = @process(42.567)
/add `Price: @price`