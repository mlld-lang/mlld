/exe @hash(data) = sh {
  # printf is a shell builtin; data is a shell-local var (heredoc-injected)
  printf %s "$data" | md5sum
}