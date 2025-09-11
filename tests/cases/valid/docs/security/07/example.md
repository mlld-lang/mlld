/exe @defensiveCheck(input, operation) = when [
  @operation == "file_write" => @validateFileOperation(@input)
  @operation == "api_call" => @validateApiCall(@input)
  * => @generalSafetyCheck(@input)
]

/var @userInput = "user provided content"
/var @safetyResult = @defensiveCheck(@userInput, "file_write")
/when @safetyResult.safe => output @userInput to "safe-output.txt"