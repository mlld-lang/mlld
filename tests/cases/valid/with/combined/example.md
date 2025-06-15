# Combined Pipeline and Needs Test

@exec format() = [(sed 's/^/> /')]

@run [(npm --version)] with {
  pipeline: [@format],
  needs: {
    "node": {
      "npm": "*"
    }
  }
}
