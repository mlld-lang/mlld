/var @tokens = 1200
/var @mode = "production"
/when (@tokens > 1000 && @mode == "production") => show "High usage alert"

/var @role = "editor"
/var @isActive = true
/when (@role == "admin" || @role == "editor") && @isActive => show "Can edit"