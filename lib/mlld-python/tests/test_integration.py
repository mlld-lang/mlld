"""
Integration tests for mlld Python wrapper
"""

import os
import tempfile
import pytest
from pathlib import Path
from mlld import Mlld, MlldError, MlldFileNotFoundError


def test_file_processing():
    """Test processing files"""
    mlld = Mlld()
    
    # Create a temporary mlld file
    with tempfile.NamedTemporaryFile(mode="w", suffix=".mld", delete=False) as f:
        f.write("""
@text title = "Test Document"
@text content = "This is a test file"

# @add @title

@add @content
""")
        temp_path = f.name
    
    try:
        result = mlld.process_file(temp_path)
        assert "Test Document" in result
        assert "This is a test file" in result
    finally:
        os.unlink(temp_path)


def test_file_output():
    """Test writing output to file"""
    mlld = Mlld()
    
    with tempfile.TemporaryDirectory() as tmpdir:
        input_file = Path(tmpdir) / "input.mld"
        output_file = Path(tmpdir) / "output.md"
        
        input_file.write_text("""
@text greeting = "Hello from file!"
@add @greeting
""")
        
        result = mlld.process_file(input_file, output_file)
        
        # Check that output file was created
        assert output_file.exists()
        assert "Hello from file!" in output_file.read_text()
        assert "Hello from file!" in result


def test_imports():
    """Test import functionality"""
    mlld = Mlld()
    
    with tempfile.TemporaryDirectory() as tmpdir:
        # Create a library file
        lib_file = Path(tmpdir) / "lib.mld"
        lib_file.write_text("""
@text shared_message = "Imported successfully!"
@data shared_config = {"status": "ready"}
""")
        
        # Create main file that imports from library
        main_file = Path(tmpdir) / "main.mld"
        main_file.write_text("""
@import { shared_message, shared_config } from "./lib.mld"

@add @shared_message
@text status = [[Status: {{shared_config.status}}]]
@add @status
""")
        
        result = mlld.process_file(main_file)
        assert "Imported successfully!" in result
        assert "Status: ready" in result


def test_file_not_found():
    """Test handling of missing files"""
    mlld = Mlld()
    
    with pytest.raises(MlldFileNotFoundError):
        mlld.process_file("/nonexistent/path/to/file.mld")


def test_working_directory():
    """Test that working directory is properly used"""
    with tempfile.TemporaryDirectory() as tmpdir:
        mlld = Mlld(working_dir=tmpdir)
        
        # Create a file in the working directory
        config_file = Path(tmpdir) / "config.mld"
        config_file.write_text('@text app_name = "TestApp"')
        
        # Process content that imports from relative path
        result = mlld.process("""
@import { app_name } from "./config.mld"
@add @app_name
""")
        
        assert "TestApp" in result


def test_error_formatting():
    """Test error formatting functionality"""
    mlld = Mlld()
    
    try:
        mlld.process("@invalid syntax")
    except MlldError as e:
        formatted = mlld.format_error(e)
        
        assert "formatted" in formatted
        assert "json" in formatted
        assert formatted["json"]["type"] in ["MlldError", "MlldParseError"]
        assert len(formatted["json"]["message"]) > 0


def test_exec_commands():
    """Test exec command definitions"""
    mlld = Mlld()
    
    result = mlld.process("""
@exec greet(name) = @run [echo "Hello, @name!"]
@run @greet("Python")
""")
    
    assert "Hello, Python!" in result


def test_complex_example():
    """Test a more complex mlld example"""
    mlld = Mlld()
    
    result = mlld.process("""
@data users = [
  {"name": "Alice", "role": "Developer"},
  {"name": "Bob", "role": "Designer"}
]

@text header = "# Team Members"
@add @header

@text user_template = [[
- **{{name}}**: {{role}}]]

@add [[
{{#users}}
{{user_template}}
{{/users}}
]]
""")
    
    assert "Team Members" in result
    assert "Alice" in result
    assert "Developer" in result
    assert "Bob" in result
    assert "Designer" in result