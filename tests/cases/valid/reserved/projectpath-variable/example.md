# @PROJECTPATH Reserved Variable Test

This tests the @PROJECTPATH reserved variable.

Project root: 
/show @PROJECTPATH

/path @configPath = [@PROJECTPATH/config]
/show ::Config location: {{configPath}}::

/var @readme = ::Project README is at {{PROJECTPATH}}/README.md::
/show @readme