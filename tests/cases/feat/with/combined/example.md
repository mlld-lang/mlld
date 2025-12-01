# Combined Pipeline and Needs Test

/needs {
  node: [npm]
}

/exe @format() = cmd {sed 's/.*/> npm available/'}

/run {npm --version} with {
pipeline: [@format]
}
