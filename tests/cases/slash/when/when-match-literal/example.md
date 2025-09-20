/var @isReReview = "true"

>> Test the match form with literal string comparisons
/when @isReReview: [
  "true" => show "This is a re-review"
  "false" => show "This is a first review"
]
