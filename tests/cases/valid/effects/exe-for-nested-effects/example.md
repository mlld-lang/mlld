# Test effects streaming from nested for loops via exe functions

This test verifies that effects stream immediately even when for loops
are nested through exe function calls, mimicking the review-comments pattern.

## Setup data structure

/var @file_sets = [
  { "name": "SetA", "files": ["file1.ts", "file2.ts"] },
  { "name": "SetB", "files": ["file3.ts"] }
]

## Define processing functions

/exe @review_file(file, set_name) = when [
  * => show "Reviewing @file in @set_name"
  * => "reviewed-@file"
]

/exe @process_file_set(file_set) = for @file in @file_set.files => @review_file(@file, @file_set.name)

## Execute nested for loops

/show "Starting nested processing..."

/var @all_results = for @set in @file_sets => @process_file_set(@set)

/show "Processing complete!"

## Show results

/for @set_results in @all_results => for @result in @set_results => show "Result: @result"