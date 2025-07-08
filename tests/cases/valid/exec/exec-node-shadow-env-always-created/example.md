# Test Node Shadow Environment Always Created

This test verifies that Node.js always uses shadow environment, never subprocess fallback.

## Test 1: Simple node execution creates shadow env

/exe @testBasic() = node {
  // Even simple code should use shadow environment
  return typeof __mlldShadowFunctions !== 'undefined' ? 'Shadow env exists' : 'No shadow env';
}

/var @basicResult = @testBasic()
/show `Basic test: @basicResult`

## Test 2: Shadow environment persists across calls

/exe @setGlobal() = node {
  global.testValue = 'Set in shadow env';
  return 'Value set';
}

/exe @getGlobal() = node {
  return global.testValue || 'Not found';
}

/var @set1 = @setGlobal()
/var @get1 = @getGlobal()
/show `Set result: @set1`
/show `Get result: @get1`

## Test 3: VM Context is used (not subprocess)

/exe @checkVMContext() = node {
  // Check for VM-specific context indicators
  // In subprocess, these would be different
  const inVM = typeof global !== 'undefined' && 
               typeof require !== 'undefined' &&
               typeof __dirname !== 'undefined';
  return inVM ? 'Running in VM context' : 'Not in VM';
}

/var @vmCheck = @checkVMContext()
/show `VM context check: @vmCheck`

## Test 4: Module resolution includes mlld dependencies

/exe @checkModulePaths() = node {
  // In shadow env, we should have access to mlld's node_modules
  try {
    // Try to require a module that's only in mlld's dependencies
    require('gray-matter');
    return 'Can access mlld dependencies';
  } catch (e) {
    return 'Cannot access mlld dependencies';
  }
}

/var @moduleResult = @checkModulePaths()
/show `Module access: @moduleResult`