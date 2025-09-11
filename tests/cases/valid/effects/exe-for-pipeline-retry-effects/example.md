# Test effects streaming with exe-for functions and pipeline retry

This test verifies that effects stream immediately when exe functions with
for loops are combined with pipeline retry logic.

## Setup mock functions

/exe @len(str) = js { return str.toString().length }

/exe @mock_api(name) = when [
  * => show "Calling API for @name..."
  * => "@name-response"
]

/exe @check_response(response, name, p) = when [
  @len(@response) < 5 && @ctx.try < 2 => show "Response too short for @name, retrying (attempt @ctx.try)..."
  @len(@response) < 5 && @ctx.try < 2 => retry
  * => show "Success for @name"
  * => @response
]

/exe @save_result(result, name) = when [
  * => show "Saving result for @name"
  * => @result
]

## Define pipeline processing

/exe @process_item(item) = @mock_api(@item) | @check_response(@item, @p) | @save_result(@item)

/exe @process_batch(batch) = for @item in @batch.items => @process_item(@item)

## Execute

/var @batches = [
  { "name": "Batch1", "items": ["A", "B"] },
  { "name": "Batch2", "items": ["C"] }
]

/show "Starting batch processing..."

/var @results = for @batch in @batches => @process_batch(@batch)

/show "Batch processing complete!"