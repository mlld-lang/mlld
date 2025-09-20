# Pipeline Function Effects Test

Testing that effects emit during pipeline stages

/exe @process(value) = js {
  console.log("Processing: " + value);
  return value + " processed";
}

/exe @transform(value) = js {
  console.log("Transforming: " + value);
  return value + " transformed";
}

/var @result = "data" | @process | @transform
/show "Final: @result"