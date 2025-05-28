#!/usr/bin/env python3
"""
Example usage of mlld Python wrapper
"""

from mlld import Mlld, MlldError

def main():
    # Initialize mlld
    mlld = Mlld()
    
    print("mlld Python Wrapper Example")
    print(f"mlld version: {mlld.version()}")
    print("-" * 40)
    
    # Example 1: Basic text processing
    print("\n1. Basic text processing:")
    result = mlld.process("""
@text greeting = "Hello from Python!"
@text name = "Developer"
@text message = [[{{greeting}} Welcome, {{name}}!]]
@add @message
""")
    print(result)
    
    # Example 2: Data structures
    print("\n2. Working with data structures:")
    result = mlld.process("""
@data config = {
  "app": "mlld-python",
  "features": ["easy", "powerful", "flexible"],
  "version": 1.0
}

@text output = [[
Application: {{config.app}}
Version: {{config.version}}
Features: {{config.features}}
]]

@add @output
""")
    print(result)
    
    # Example 3: Running commands
    print("\n3. Running commands:")
    result = mlld.process("""
@run [echo "Current directory:"]
@run [pwd]
""")
    print(result)
    
    # Example 4: Error handling
    print("\n4. Error handling:")
    try:
        mlld.process("@invalid syntax")
    except MlldError as e:
        error_info = mlld.format_error(e)
        print("Caught error:")
        print(error_info["formatted"])
    
    # Example 5: Processing files
    print("\n5. File processing (example):")
    print("mlld.process_file('example.mld', 'output.md')")


if __name__ == "__main__":
    main()