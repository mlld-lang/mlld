>> Load entire codebase
/var @contracts = <**/*.sol>

>> Process with shell executable - parameter becomes shell variable
/exe @analyze(code) = sh {
  echo "$code" | solidity-analyzer
}

>> Pass the mlld variable when calling
/show @analyze(@contracts)