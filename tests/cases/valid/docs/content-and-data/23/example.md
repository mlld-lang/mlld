>> Load files and check context limits
/var @files = <src/**/*.ts>

>> Define filter for large files (over 2000 tokens)
/exe @filterLarge(files) = js {
  return files.filter(f => f.tokest > 2000)
}
/var @large = @filterLarge(@files)

>> Calculate total tokens
/exe @sumTokens(files) = js {
  return files.reduce((sum, f) => sum + (f.tokest || 0), 0)
}
/var @totalTokens = @sumTokens(@files)

/show `Found @large.length files over 2000 tokens`
/show `Total estimated tokens: @totalTokens`