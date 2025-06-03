# Combined Pipeline and Needs Test

@exec format(text) = @run [echo "@text" | sed 's/^/> /']

@run [npm --version] with {
  pipeline: [@format],
  needs: {
    "node": {
      "npm": "*"
    }
  }
}
