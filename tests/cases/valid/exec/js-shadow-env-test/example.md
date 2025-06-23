# Test JavaScript Shadow Environment

/exe @add(a, b) = js {a + b}

/exe @multiply(x, y) = js {x * y}

/exe js = { add, multiply }

/exe @calculate(n) = js {
  const sum = add(n, 10);
  const product = multiply(sum, 2);
  return product;
}

/exe js = { add, multiply, calculate }

/run js {
  // Test direct calls
  const r1 = add(5, 3);
  const r2 = multiply(4, 7);
  const r3 = calculate(5); // (5+10)*2 = 30
  
  console.log(JSON.stringify({ r1, r2, r3 }));
}