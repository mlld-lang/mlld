# ✅ Good - descriptive names
/var @test_user_validation_requires_email = @validateEmail(@user.email)
/var @test_password_must_be_8_characters = @checkPasswordLength(@password)
/var @test_admin_can_delete_posts = @canDelete(@user, @post)

# ❌ Bad - unclear names  
/var @test_validation = @validate()
/var @test_user = @check(@user)
/var @test_1 = @test()