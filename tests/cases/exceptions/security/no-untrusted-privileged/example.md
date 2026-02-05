var @policyConfig = {
  defaults: { rules: ["no-untrusted-privileged"] }
}
policy @p = union(@policyConfig)

var untrusted @payload = "data"
exe privileged @admin(data) = run cmd { echo "@data" }
@admin(@payload)
