# Imported policy denies command

/import policy @prod from "./import-policy-deny-config.mld"

/run { echo "blocked" }
