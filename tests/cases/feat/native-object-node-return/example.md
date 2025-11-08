/comment Test property access on native objects from node {( )} returns

/exe @getPackageInfo() = node {(
  {
    name: "test-package",
    version: "1.0.0",
    author: {
      name: "Test Author",
      email: "test@example.com"
    },
    dependencies: {
      mlld: "^1.0.0",
      lodash: "^4.17.21"
    }
  }
)}

/var @pkg = @getPackageInfo()
/var @pkgName = @pkg.name
/var @pkgVersion = @pkg.version
/var @authorName = @pkg.author.name
/var @authorEmail = @pkg.author.email

/show `Package: @pkgName v@pkgVersion`
/exe @formatAuthor(name, email) = js { return `${name} <${email}>`; }
/var @authorLine = @formatAuthor(@authorName, @authorEmail)
/show `Author: @authorLine`

/comment Test accessing object keys
/exe @getMlldVersion(pkg) = node { return pkg.dependencies.mlld; }
/var @mlldVersion = @getMlldVersion(@pkg)
/show `mlld dependency: @mlldVersion`
