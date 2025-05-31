# @PROJECTPATH Reserved Variable Test

This tests the @PROJECTPATH reserved variable.

Project root: @add @PROJECTPATH

@path configPath = @PROJECTPATH/config
@add Config location: @configPath

@text readme = [[Project README is at {{PROJECTPATH}}/README.md]]
@add @readme