# JS and Node console.log precedence in run blocks

/run js {
  console.log('js-log-only');
}

/run js {
  console.log('js-log-and-return');
  return 'js-return';
}

/run node {
  console.log('node-log-only');
}

/run node {
  console.log('node-log-and-return');
  return 'node-return';
}
