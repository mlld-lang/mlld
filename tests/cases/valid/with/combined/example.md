# Combined Pipeline and Needs Test

@exec format() = @run [(sed 's/^/> /')]

@run [(npm --version)] with {
  pipeline: [@format],
  needs: {
    "node": {
      "npm": "*"
    }
  }
}
