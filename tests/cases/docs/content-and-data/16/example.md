>> Exact symbol names
/var @user = <src/service.ts { createUser }>
/var @multiple = <src/api.ts { handleRequest, processData }>

>> Usage patterns - find functions that use a symbol
/var @callers = <src/**/*.ts { (logger.info) }>