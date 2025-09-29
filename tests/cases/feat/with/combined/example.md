# Combined Pipeline and Needs Test

/exe @format() = {sed 's/.*/> npm available/'}

/run {npm --version} with {
pipeline: [@format],
needs: {
    "node": {
      "npm": "*"
    }
  }
}
