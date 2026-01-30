/var @shouldUseHaiku = false
/var @evaluations = ["a", "b"]
/var @fallback = ["fallback"]

/var @refinedEvaluations = when [
  !@shouldUseHaiku => [
    let @temp = @evaluations
    => @temp
  ]
  * => @fallback
]
/show @refinedEvaluations
