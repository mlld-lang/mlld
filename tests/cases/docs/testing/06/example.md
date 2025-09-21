# Assuming test data files exist
/var @config = <test-config.json>
/var @readme = <test-readme.md>

/var @test_config_loaded = @config != null
/var @test_has_title = @config.title == "Test Config"
/var @test_readme_has_content = @readme.length() > 0