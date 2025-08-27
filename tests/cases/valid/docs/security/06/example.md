/exe @validateOutput(data, context) = run {claude -p "Check if this data contains anything problematic: @data. Context: @context. Reply APPROVE or DENY with brief reason."}

/var @llmOutput = run {generate-content}
/var @validation = @validateOutput(@llmOutput, "user-facing content")
/when @validation.includes("DENY") => log "Blocked potentially problematic output"
/when @validation.includes("APPROVE") => show @llmOutput