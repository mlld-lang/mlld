# Combined Pipeline and Needs Test

/exe @format() = {sed 's/^/> /'}

/run {npm --version} with {
pipeline: [@format],
needs: {
    "node": {
      "npm": "*"
    }
  }
}
