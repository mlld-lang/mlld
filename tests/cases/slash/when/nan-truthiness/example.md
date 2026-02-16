/var @nanNumber = "hello" + 5
/var @nanText = "NaN"

/if @nanNumber [
  show "FAIL: numeric NaN in if"
] else [
  show "if numeric NaN is falsy"
]

/if @nanText [
  show "FAIL: text NaN in if"
] else [
  show "if text NaN is falsy"
]

/when @nanNumber => show "FAIL: numeric NaN in when simple"
/when !@nanNumber => show "when numeric NaN negates true"

/when @nanText => show "FAIL: text NaN in when simple"
/when !@nanText => show "when text NaN negates true"

/var @pickNumber = when [
  @nanNumber => "yes"
  * => "no"
]
/var @pickText = when [
  @nanText => "yes"
  * => "no"
]

/show "when expression number: @pickNumber"
/show "when expression text: @pickText"

/show `include-number:@nanNumber?`
/show `include-text:@nanText?`
