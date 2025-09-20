>> Stage 1: Mock Claude API call
/exe @claude(prompt) = js {
  console.error(`[Claude] Processing prompt (length: ${prompt.length})`);
  return JSON.stringify({ review: `Review for prompt`, length: prompt.length });
}

>> Stage 2: Check and validate review (pipeline-friendly single param)
/exe @check_review(review) = js {
  console.error(`[Check] Validating review`);
  const parsed = JSON.parse(review);
  // Don't actually trigger retry in test - we're testing nested pipelines, not retry
  return JSON.stringify({ ...parsed, checked: true });
}

>> Stage 3: Save review (pipeline-friendly single param)
/exe @save_review(review) = js {
  console.error(`[Save] Saving review`);
  const parsed = JSON.parse(review);
  return `Saved: Review of ${parsed.length} chars`;
}

>> Create prompt from file
/exe @create_prompt(file, notes) = js {
  return `Review ${file.name}: ${notes}`;
}

>> THIS IS THE BUG: Pipeline should work here
/exe @review_file(file, notes) = @claude(@create_prompt(@file, @notes)) | @check_review | @save_review

>> Process a single file
/exe @process_file_set(file_set) = for @file in @file_set.files => @review_file(@file, @file_set.notes)

>> Test data
/var @file_sets = [
  { 
    name: "Content Loading", 
    files: [{ name: "content-loader.ts" }, { name: "import.ts" }],
    notes: "Focus on lazy evaluation"
  }
]

>> Execute the nested pipeline
/var @all_results = for @set in @file_sets => @process_file_set(@set)

>> Show results
/for @result_set in @all_results => for @result in @result_set => show @result