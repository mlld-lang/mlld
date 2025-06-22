# Needs Node Test

This test checks for npm (which should always exist with node).

/run {echo "npm is available"} with {
  needs: {
    "node": {
      "npm": "*"
    }
  }
}