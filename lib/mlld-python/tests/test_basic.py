"""
Basic tests for mlld Python wrapper
"""

import pytest
from mlld import Mlld, MlldError, MlldParseError


def test_mlld_initialization():
    """Test that Mlld can be initialized"""
    mlld = Mlld()
    assert mlld.node_path is not None
    assert mlld.mlld_path is not None


def test_simple_processing():
    """Test basic mlld processing"""
    mlld = Mlld()
    
    result = mlld.process("""
@text greeting = "Hello, World!"
@add @greeting
""")
    
    assert "Hello, World!" in result


def test_variable_interpolation():
    """Test variable interpolation in templates"""
    mlld = Mlld()
    
    result = mlld.process("""
@text name = "Python"
@text message = [[Welcome to {{name}}!]]
@add @message
""")
    
    assert "Welcome to Python!" in result


def test_command_execution():
    """Test command execution with @run"""
    mlld = Mlld()
    
    result = mlld.process("""
@run [echo "Testing command execution"]
""")
    
    assert "Testing command execution" in result


def test_data_structures():
    """Test data structure handling"""
    mlld = Mlld()
    
    result = mlld.process("""
@data config = {
  "name": "mlld-python",
  "version": "1.0.0",
  "features": ["parsing", "execution", "formatting"]
}
@text output = [[Project: {{config.name}} v{{config.version}}]]
@add @output
""")
    
    assert "Project: mlld-python v1.0.0" in result


def test_parse_error():
    """Test that parse errors are properly raised"""
    mlld = Mlld()
    
    with pytest.raises(MlldError) as exc_info:
        mlld.process("@invalid syntax here")
    
    # The error should contain information about the syntax error
    assert "invalid" in str(exc_info.value).lower() or "parse" in str(exc_info.value).lower()


def test_format_xml():
    """Test XML output format"""
    mlld = Mlld()
    
    result = mlld.process("""
@text content = "Test content"
@add @content
""", format="xml")
    
    # Should contain XML-style output
    assert "<" in result and ">" in result


def test_version():
    """Test version retrieval"""
    mlld = Mlld()
    version = mlld.version()
    
    # Should return a version string
    assert version != "unknown"
    assert len(version) > 0