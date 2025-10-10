/exe @publicHelper(x) = `Value: @x`
/exe @_internalHelper(x) = run {echo "@x" | tr a-z A-Z}

/export { @publicHelper }