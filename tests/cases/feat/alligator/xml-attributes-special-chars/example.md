// XML/HTML tags with dots, @, etc in attribute values should NOT trigger file loading
/var @version = "2.0"
/var @test1 = "Tag with dots: <MLLD_GUIDE version='1.0.0'>"
/var @test2 = "Tag with @: <CustomTag data-value='test@example.com'>"
/var @test3 = "HTML with dots: <input type='text' name='field.name'>"

/show @test1
/show @test2
/show @test3
