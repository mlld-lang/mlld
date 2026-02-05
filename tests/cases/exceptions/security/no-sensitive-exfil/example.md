var @policyConfig = {
  defaults: { rules: ["no-sensitive-exfil"] }
}
policy @p = union(@policyConfig)

var sensitive @payload = "data"
exe exfil @send(data) = run cmd { echo "@data" }
@send(@payload)
