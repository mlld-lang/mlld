/exe @deploy(env) = when first [
  @env == "prod" => @deploy("careful")
  @env == "staging" => @deploy("normal")
  * => show "Local only"
]

/run @deploy("prod")