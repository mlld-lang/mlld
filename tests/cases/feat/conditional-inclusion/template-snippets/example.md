/var @toolsPrimary = "json"
/var @flagsPrimary = ""
/var @cmdPrimary = ::claude@toolsPrimary?` --allowedTools "@toolsPrimary"`@flagsPrimary?` --flags "@flagsPrimary"`::
/var @toolsSecondary = ""
/var @flagsSecondary = "fast"
/var @cmdSecondary = ::claude@toolsSecondary?` --allowedTools "@toolsSecondary"`@flagsSecondary?` --flags "@flagsSecondary"`::
/show @cmdPrimary
/show @cmdSecondary
