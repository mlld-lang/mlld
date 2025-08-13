# Test: Actions in exe when

/exe @isjson(text) = js {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/exe @validate(answer, retries) = when: [
  @isjson(@answer) => @answer
  !@isjson(@answer) => /show `Invalid JSON`
  * => /show `Error`
]