/exe @isProduction() = sh {test "$NODE_ENV" = "production" && echo "true"}
/when first [
  @isProduction() && @testsPass => run {npm run deploy:prod}
  @testsPass => run {npm run deploy:staging}
  * => show "Cannot deploy: tests failing"
]