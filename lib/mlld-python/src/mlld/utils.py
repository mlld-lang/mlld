"""
Utility functions for mlld Python wrapper
"""

import os
import sys
import shutil
import subprocess
from pathlib import Path
from typing import Optional, List, Tuple


def find_node_binary() -> Optional[str]:
    """Find Node.js binary in the system"""
    # Check common binary names
    for binary in ["node", "nodejs"]:
        path = shutil.which(binary)
        if path:
            return path
    
    # Check common installation directories
    common_paths = [
        "/usr/local/bin/node",
        "/usr/bin/node",
        "/opt/homebrew/bin/node",
        # Windows paths
        "C:\\Program Files\\nodejs\\node.exe",
        "C:\\Program Files (x86)\\nodejs\\node.exe",
    ]
    
    for path in common_paths:
        if os.path.exists(path) and os.access(path, os.X_OK):
            return path
    
    return None


def find_mlld_installation() -> Optional[str]:
    """Find mlld installation path"""
    # First, check if we're in development mode (monorepo)
    current_file = Path(__file__).resolve()
    monorepo_root = current_file.parents[4]  # lib/mlld-python/src/mlld -> root
    
    if (monorepo_root / "package.json").exists():
        # Check if it's the mlld package
        package_json = monorepo_root / "package.json"
        try:
            import json
            with open(package_json) as f:
                data = json.load(f)
                if data.get("name") == "mlld":
                    # Development mode - use the built CLI
                    cli_path = monorepo_root / "dist" / "cli" / "cli-entry.js"
                    if cli_path.exists():
                        return str(cli_path)
        except:
            pass
    
    # Check if mlld is installed globally via npm
    try:
        result = subprocess.run(
            ["npm", "list", "-g", "--depth=0", "--json"],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            import json
            data = json.loads(result.stdout)
            deps = data.get("dependencies", {})
            if "mlld" in deps:
                # Get the global npm prefix
                prefix_result = subprocess.run(
                    ["npm", "prefix", "-g"],
                    capture_output=True,
                    text=True,
                )
                if prefix_result.returncode == 0:
                    prefix = prefix_result.stdout.strip()
                    mlld_bin = Path(prefix) / "bin" / "mlld"
                    if mlld_bin.exists():
                        return str(mlld_bin)
    except:
        pass
    
    # Check if mlld is in PATH
    mlld_path = shutil.which("mlld")
    if mlld_path:
        return mlld_path
    
    return None


def check_node_version(node_path: str) -> Tuple[bool, str]:
    """Check if Node.js version meets requirements (>= 14.0.0)"""
    try:
        result = subprocess.run(
            [node_path, "--version"],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            version_str = result.stdout.strip()
            # Parse version (e.g., "v14.17.0" -> (14, 17, 0))
            version_parts = version_str.lstrip("v").split(".")
            major = int(version_parts[0])
            
            if major >= 14:
                return True, version_str
            else:
                return False, f"Node.js version {version_str} is too old (requires >= 14.0.0)"
    except Exception as e:
        return False, f"Failed to check Node.js version: {e}"
    
    return False, "Could not determine Node.js version"


def escape_shell_arg(arg: str) -> str:
    """Escape shell arguments for safe execution"""
    # For subprocess with shell=False, we don't need complex escaping
    # Just ensure no null bytes
    return arg.replace("\0", "")


def parse_cli_error(stderr: str) -> Optional[dict]:
    """Parse JSON error from CLI stderr if available"""
    # Look for JSON error output
    lines = stderr.strip().split("\n")
    for line in reversed(lines):
        if line.strip().startswith("{") and "error" in line:
            try:
                import json
                return json.loads(line)
            except:
                continue
    return None