/when @score >= 80 && @submitted => show "Passed"
/when (@role == "admin" || @role == "mod") && @active => show "Privileged"