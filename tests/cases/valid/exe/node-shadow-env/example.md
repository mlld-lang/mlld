# Test Node.js Shadow Environment

/exe @add(a, b) = node {
  return a + b;
}

/exe @multiply(x, y) = node {
  return x * y;
}

/exe @calculate(n) = node {
  // Can call other shadow functions
  const sum = await add(n, 10);
  const product = await multiply(sum, 2);
  return product;
}

/exe nodejs = { add, multiply, calculate }

>> Test using direct run directive (not inside @text)
/run node {
  const r1 = await add(5, 3);
  const r2 = await multiply(4, 7);
  const r3 = await calculate(5); // (5+10)*2 = 30
  
  console.log(JSON.stringify({ r1, r2, r3 }));
}