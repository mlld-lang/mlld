/var @canDeploy = @testsPass && @isApproved
/when [
  @canDeploy => run {npm run deploy}
  !@canDeploy => show "Deployment blocked - check tests and approval"
]