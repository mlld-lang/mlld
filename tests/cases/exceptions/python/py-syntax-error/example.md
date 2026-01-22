# Python Syntax Error Test

Tests that Python syntax errors are properly reported.

/exe @broken() = py {
  if True
    print("missing colon")
}

/show @broken()
