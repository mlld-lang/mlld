/output "seed" to "/tmp/run-cwd-expression-collection-seed.txt"

/var @dirs = ["/", "/tmp"]
/var @dir = "/tmp"
/var @expectedTmpBase = node:@dir {
  const path = require('path');
  return path.basename(process.cwd()) || '/';
}

/var @forResults = for @iterDir in @dirs [
  => run cmd:@iterDir { basename "$PWD" }
]
/var @forSecondMatches = @forResults[1] == @expectedTmpBase
/show `for-second-matches=@forSecondMatches`

/var @whenResult = when true => cmd:@dir { basename "$PWD" }
/var @whenMatches = @whenResult == @expectedTmpBase
/show `when-matches=@whenMatches`

/show "side-effect-check-begin"
/run cmd { test -d / }
/run cmd:@dir { test -f run-cwd-expression-collection-seed.txt }
/when true => [
  run cmd:@dir { test -f run-cwd-expression-collection-seed.txt }
]
/show "side-effect-check-end"
