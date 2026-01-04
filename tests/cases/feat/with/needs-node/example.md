# Needs Node Test

This test checks for npm (which should always exist with node).

/needs {
  node: [npm]
}

/run {echo "npm is available"}
