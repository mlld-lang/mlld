# Test Console.log NOT Captured in /run Directive

This test verifies that console.log is NOT captured as return value in /run directives.

## Setup shadow environment

/exe @logMessage(msg) = node {
  console.log(`Message: ${msg}`);
  return 'Return value ignored';
}

/exe nodejs = { logMessage }

## Test /run directive with console.log

/run node {
  console.log('This should appear in output');
  console.log('So should this');
  return 'This return value is ignored in /run';
}

## Test /run with shadow function

/run node {
  await logMessage('From shadow function');
}

## Compare with /var assignment

/var @capturedResult = node {
  console.log('This gets captured');
  return 'But return takes precedence';
}

/show `Captured in var: @capturedResult`