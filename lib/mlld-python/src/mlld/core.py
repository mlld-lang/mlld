"""
Core implementation of mlld Python wrapper
"""

import os
import subprocess
import tempfile
import json
from pathlib import Path
from typing import Optional, Dict, Any, Union

from .errors import MlldError
from .utils import (
    find_node_binary,
    find_mlld_installation,
    check_node_version,
    escape_shell_arg,
    parse_cli_error,
)


class Mlld:
    """Python wrapper for mlld (Meld) markup language processor"""
    
    def __init__(
        self,
        node_path: Optional[str] = None,
        mlld_path: Optional[str] = None,
        working_dir: Optional[str] = None,
    ):
        """
        Initialize mlld wrapper
        
        Args:
            node_path: Path to Node.js binary (auto-detected if None)
            mlld_path: Path to mlld installation (auto-detected if None)
            working_dir: Working directory for mlld execution (current dir if None)
        """
        # Find Node.js
        self.node_path = node_path or find_node_binary()
        if not self.node_path:
            raise MlldError(
                "Node.js not found. Please install Node.js 14+ or specify node_path"
            )
        
        # Verify Node.js version
        valid, version_info = check_node_version(self.node_path)
        if not valid:
            raise MlldError(f"Node.js version error: {version_info}")
        
        # Find mlld
        self.mlld_path = mlld_path or find_mlld_installation()
        if not self.mlld_path:
            raise MlldError(
                "mlld not found. Please install mlld globally (npm install -g mlld) "
                "or specify mlld_path"
            )
        
        self.working_dir = working_dir or os.getcwd()
    
    def process(
        self,
        content: str,
        format: str = "markdown",
        base_path: Optional[str] = None,
        url_enabled: bool = False,
        url_allowed_domains: Optional[list] = None,
        url_blocked_domains: Optional[list] = None,
        **kwargs
    ) -> str:
        """
        Process mlld content
        
        Args:
            content: Mlld source content
            format: Output format ('markdown' or 'xml')
            base_path: Base path for file resolution
            url_enabled: Enable URL imports
            url_allowed_domains: List of allowed domains for URL imports
            url_blocked_domains: List of blocked domains for URL imports
            **kwargs: Additional CLI options
            
        Returns:
            Processed output as string
            
        Raises:
            MlldError: If processing fails
        """
        # Create temporary input file
        with tempfile.NamedTemporaryFile(
            mode="w",
            suffix=".mld",
            dir=self.working_dir,
            delete=False,
        ) as tmp_input:
            tmp_input.write(content)
            tmp_input_path = tmp_input.name
        
        try:
            # Build command
            cmd = [self.node_path, self.mlld_path]
            
            # Add format option
            cmd.extend(["--format", format])
            
            # Add base path if specified
            if base_path:
                cmd.extend(["--base-path", base_path])
            
            # Add URL options
            if url_enabled:
                cmd.append("--url")
                if url_allowed_domains:
                    cmd.extend(["--url-allow", ",".join(url_allowed_domains)])
                if url_blocked_domains:
                    cmd.extend(["--url-block", ",".join(url_blocked_domains)])
            
            # Add error format for better parsing
            cmd.append("--error-format=json")
            
            # Add input file
            cmd.append(tmp_input_path)
            
            # Execute mlld
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                cwd=self.working_dir,
            )
            
            if result.returncode != 0:
                # Parse error from stderr
                error_data = parse_cli_error(result.stderr)
                if error_data:
                    raise MlldError.from_json(error_data)
                else:
                    # Fallback to raw stderr
                    raise MlldError(
                        f"mlld processing failed: {result.stderr}",
                        details=result.stderr,
                    )
            
            return result.stdout
            
        finally:
            # Clean up temporary file
            try:
                os.unlink(tmp_input_path)
            except:
                pass
    
    def process_file(
        self,
        input_path: Union[str, Path],
        output_path: Optional[Union[str, Path]] = None,
        **kwargs
    ) -> str:
        """
        Process mlld file
        
        Args:
            input_path: Path to input .mld file
            output_path: Optional output path (if None, returns content)
            **kwargs: Same options as process()
            
        Returns:
            Processed output as string
            
        Raises:
            MlldError: If processing fails
        """
        input_path = Path(input_path)
        
        if not input_path.exists():
            raise MlldFileNotFoundError(f"Input file not found: {input_path}")
        
        # Build command
        cmd = [self.node_path, self.mlld_path]
        
        # Add format option
        format = kwargs.get("format", "markdown")
        cmd.extend(["--format", format])
        
        # Add base path (default to input file's directory)
        base_path = kwargs.get("base_path", str(input_path.parent))
        cmd.extend(["--base-path", base_path])
        
        # Add URL options
        if kwargs.get("url_enabled"):
            cmd.append("--url")
            if kwargs.get("url_allowed_domains"):
                cmd.extend(["--url-allow", ",".join(kwargs["url_allowed_domains"])])
            if kwargs.get("url_blocked_domains"):
                cmd.extend(["--url-block", ",".join(kwargs["url_blocked_domains"])])
        
        # Add error format
        cmd.append("--error-format=json")
        
        # Add input file
        cmd.append(str(input_path))
        
        # Add output file if specified
        if output_path:
            cmd.extend(["--output", str(output_path)])
        
        # Execute mlld
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=self.working_dir,
        )
        
        if result.returncode != 0:
            # Parse error from stderr
            error_data = parse_cli_error(result.stderr)
            if error_data:
                raise MlldError.from_json(error_data)
            else:
                raise MlldError(
                    f"mlld processing failed: {result.stderr}",
                    details=result.stderr,
                )
        
        # If output was written to file, read and return it
        if output_path and Path(output_path).exists():
            with open(output_path, "r") as f:
                return f.read()
        
        return result.stdout
    
    def format_error(
        self,
        error: Union[MlldError, Exception],
        use_colors: bool = False,
        show_source: bool = True,
    ) -> Dict[str, Any]:
        """
        Format mlld errors for display
        
        Args:
            error: Error to format
            use_colors: Enable ANSI color codes
            show_source: Show source context
            
        Returns:
            Dict with 'formatted' and 'json' keys
        """
        if isinstance(error, MlldError):
            return {
                "formatted": error.formatted_error,
                "json": {
                    "type": error.error_type,
                    "message": str(error),
                    "location": error.location,
                    "details": error.details,
                },
            }
        else:
            # Generic error
            return {
                "formatted": str(error),
                "json": {
                    "type": type(error).__name__,
                    "message": str(error),
                },
            }
    
    def version(self) -> str:
        """Get mlld version"""
        result = subprocess.run(
            [self.node_path, self.mlld_path, "--version"],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            return result.stdout.strip()
        return "unknown"