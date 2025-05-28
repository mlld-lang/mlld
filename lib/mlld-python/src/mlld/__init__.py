"""
mlld - Python wrapper for the mlld (Meld) markup language processor
"""

from .core import Mlld
from .errors import (
    MlldError,
    MlldParseError,
    MlldRuntimeError,
    MlldImportError,
    MlldFileNotFoundError,
    MlldCommandExecutionError,
)

# Version will be synced with main mlld package
__version__ = "0.1.0"

__all__ = [
    "Mlld",
    "MlldError",
    "MlldParseError",
    "MlldRuntimeError",
    "MlldImportError",
    "MlldFileNotFoundError",
    "MlldCommandExecutionError",
    "__version__",
]