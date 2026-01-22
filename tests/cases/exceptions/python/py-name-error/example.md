# Python Name Error Test

Tests that Python NameError (undefined variable) is properly reported.

/exe @useUndefined() = py {
  print(undefined_variable)
}

/show @useUndefined()
