/guard privileged @bless after secret = when [
  * => trusted!,!secret @output
]

/guard privileged @clear after pii = when [
  * => clear! @output
]

/exe @secretOut() = [
  => secret,untrusted "payload-1"
]

/exe @piiOut() = [
  => pii,trusted "payload-2"
]

/var @blessed = @secretOut()
/show @blessed.mx.labels.includes("trusted")
/show @blessed.mx.labels.includes("untrusted")
/show @blessed.mx.labels.includes("secret")

/var @cleared = @piiOut()
/show @cleared.mx.labels.length
/show @cleared.mx.taint.includes("src:exe")
/show @cleared.mx.taint.includes("trusted")
/show @cleared.mx.taint.includes("pii")
