/exe @assertEq(actual, expected) = @actual == @expected
/exe @assertContains(container, item) = @container.includes(@item)
/exe @assertLength(array, expectedLength) = @array.length() == @expectedLength

# Use helpers in tests
/var @test_user_name = @assertEq(@user.name, "Alice")
/var @test_tags_include_admin = @assertContains(@user.tags, "admin")
/var @test_permissions_count = @assertLength(@user.permissions, 3)