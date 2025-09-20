/import "file.mld"                             << everything (only for files without `/export`)
/import { somevar, somexe } from "file.mld"    << selective (preferred)
/import @author/module                         << public modules
/import @company/module                        << private modules
/import @local/module                          << local modules