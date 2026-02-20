# py Alias Works in Assignment Contexts

/var @fromVar = py {
print('var-ok')
}

/exe @fromExe() = py {
print('exe-ok')
}

/show `var=@fromVar`
/show `exe=@fromExe()`

/run py {
print('run-ok')
}
