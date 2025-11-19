/guard @secretShellPolicy for secret = when [
  @ctx.op.type == "run" && @ctx.op.subtype == "sh" => deny "No secrets in heredoc"
  * => allow
]

/var secret @token = "  sk-heredoc-321  "

/run sh {
cat <<'EOF'
@token.trim()
EOF
} when [
  denied => show `heredoc denied: @ctx.guard.reason`
]

/run {echo "safe literal"} to "/tmp/safety.log"
/show <@tmp/safety.log>
