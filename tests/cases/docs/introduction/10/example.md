/when first [
  @env == "prod" => @deploy("careful")
  @env == "staging" => @deploy("normal")
  * => show "Local only"
]