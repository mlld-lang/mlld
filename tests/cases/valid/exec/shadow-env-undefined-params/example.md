# Test Shadow Environment with Undefined Parameters

@exec processText(text, transform, options) = node [(
  // Test function that uses optional parameters
  let result = text;
  
  if (transform !== undefined) {
    if (transform === "uppercase") {
      result = result.toUpperCase();
    } else if (transform === "lowercase") {
      result = result.toLowerCase();
    }
  }
  
  if (options !== undefined && options.prefix) {
    result = options.prefix + result;
  }
  
  return result;
)]

@exec nodejs = { processText }

# Test with shadow environment
@run node [(
  // Call with all parameters
  const r1 = await processText("Hello World", "uppercase", { prefix: ">> " });
  
  // Call with only input (transform and options undefined)
  const r2 = await processText("Test Message");
  
  // Call with input and transform (options undefined)
  const r3 = await processText("Mixed Case", "lowercase");
  
  console.log(JSON.stringify({ r1, r2, r3 }, null, 2));
)]