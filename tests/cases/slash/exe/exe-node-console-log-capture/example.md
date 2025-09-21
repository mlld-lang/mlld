# Test Console.log Capture in Node.js

This test verifies that console.log is captured as return value in /var assignments.

## Test console.log capture in variable assignment

/exe @addWithLog(a, b) = node {
  const result = Number(a) + Number(b);
  console.log(result);
}

/exe @addWithReturn(a, b) = node {
  const result = Number(a) + Number(b);
  return result;
}

/exe @addWithBoth(a, b) = node {
  const result = Number(a) + Number(b);
  console.log('Calculating...');
  return result;
}

/var @logResult = @addWithLog(5, 3)
/var @returnResult = @addWithReturn(5, 3)
/var @bothResult = @addWithBoth(5, 3)

/show `Console.log result: @logResult`
/show `Return result: @returnResult`
/show `Both result: @bothResult`

## Test multiple console.log calls

/exe @multipleConsoleLog() = node {
  console.log('First');
  console.log('Second');
  console.log('Last');
}

/var @multiResult = @multipleConsoleLog()
/show `Multiple console.log result: @multiResult`

## Test console.log with multiple arguments

/exe @consoleLogMultipleArgs() = node {
  console.log('Hello', 'World', 123);
}

/var @multiArgResult = @consoleLogMultipleArgs()
/show `Multi-arg result: @multiArgResult`