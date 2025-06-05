"""
Error classes for mlld Python wrapper
"""

import json
from typing import Optional, Dict, Any


class MlldError(Exception):
    """Base exception for all mlld errors"""
    
    def __init__(
        self,
        message: str,
        error_type: str = "MlldError",
        location: Optional[Dict[str, Any]] = None,
        details: Optional[str] = None,
        formatted_error: Optional[str] = None,
    ):
        super().__init__(message)
        self.error_type = error_type
        self.location = location
        self.details = details
        self.formatted_error = formatted_error or message
    
    @classmethod
    def from_json(cls, error_data: Dict[str, Any]) -> "MlldError":
        """Create error from JSON output of mlld CLI"""
        error_type = error_data.get("type", "MlldError")
        
        # Map to specific error class
        error_class = ERROR_TYPE_MAP.get(error_type, cls)
        
        return error_class(
            message=error_data.get("message", "Unknown error"),
            error_type=error_type,
            location=error_data.get("location"),
            details=error_data.get("details"),
            formatted_error=error_data.get("formatted"),
        )


class MlldParseError(MlldError):
    """Raised when mlld syntax cannot be parsed"""
    
    def __init__(self, message: str, **kwargs):
        super().__init__(message, error_type="MlldParseError", **kwargs)


class MlldRuntimeError(MlldError):
    """Raised during mlld execution"""
    
    def __init__(self, message: str, **kwargs):
        super().__init__(message, error_type="MlldRuntimeError", **kwargs)


class MlldImportError(MlldError):
    """Raised when imports fail"""
    
    def __init__(self, message: str, **kwargs):
        super().__init__(message, error_type="MlldImportError", **kwargs)


class MlldFileNotFoundError(MlldError):
    """Raised when referenced files cannot be found"""
    
    def __init__(self, message: str, **kwargs):
        super().__init__(message, error_type="MlldFileNotFoundError", **kwargs)


class MlldCommandExecutionError(MlldError):
    """Raised when shell commands fail"""
    
    def __init__(self, message: str, **kwargs):
        super().__init__(message, error_type="MlldCommandExecutionError", **kwargs)


# Mapping of error types to classes
ERROR_TYPE_MAP = {
    "MlldError": MlldError,
    "MlldParseError": MlldParseError,
    "MlldRuntimeError": MlldRuntimeError,
    "MlldImportError": MlldImportError,
    "MlldFileNotFoundError": MlldFileNotFoundError,
    "MlldCommandExecutionError": MlldCommandExecutionError,
    "MlldInterpreterError": MlldRuntimeError,
    "MlldDirectiveError": MlldRuntimeError,
    "VariableRedefinitionError": MlldRuntimeError,
    "VariableResolutionError": MlldRuntimeError,
}