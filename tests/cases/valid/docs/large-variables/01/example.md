# This works with large data when MLLD_BASH_HEREDOC=1
/var @contracts = <**/*.sol>
/exe @analyze(code) = sh {
  echo "$code" | solidity-analyzer
}
/show @analyze(@contracts)