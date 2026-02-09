var @policyConfig = {
  defaults: { rules: ["no-secret-exfil"] }
}
policy @p = union(@policyConfig)

var secret @key = "sk-123"
exe exfil @leak(data) = show @data
@leak(@key)
