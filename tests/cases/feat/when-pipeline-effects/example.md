/var @value = "alpha"

/var @appendResult = when [
  true => @value | append "when-pipeline-effects.log"
]

/var @outputResult = when [
  true => @value | output to "when-pipeline-effects.txt"
]

/var @logResult = when [
  true => @value | log
]

/var @showResult = when [
  true => @value | show
]

/show ::append:@appendResult::
/show ::output:@outputResult::
/show ::log:@logResult::
/show ::showValue:@showResult::
