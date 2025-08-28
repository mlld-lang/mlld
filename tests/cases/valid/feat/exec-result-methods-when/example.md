/exe @identity(x) = js { return x }
/var @text = "APPROVE it"
/when @identity(@text).includes("APPROVE") => show "ok"

