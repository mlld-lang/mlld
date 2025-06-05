"""
Setup script for mlld Python wrapper
"""

from setuptools import setup, find_packages

# Read version from __init__.py
version = "0.1.0"
with open("src/mlld/__init__.py", "r") as f:
    for line in f:
        if line.startswith("__version__"):
            version = line.split("=")[1].strip().strip('"').strip("'")
            break

# Read long description from README
with open("README.md", "r", encoding="utf-8") as f:
    long_description = f.read()

setup(
    name="mlld",
    version=version,
    description="Python wrapper for the mlld (Meld) markup language processor",
    long_description=long_description,
    long_description_content_type="text/markdown",
    author="Mlld Team",
    author_email="contact@mlld-lang.org",
    url="https://github.com/mlld-lang/mlld",
    packages=find_packages(where="src"),
    package_dir={"": "src"},
    python_requires=">=3.7",
    install_requires=[],
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.7",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Topic :: Text Processing :: Markup",
        "Topic :: Software Development :: Libraries :: Python Modules",
    ],
    keywords="mlld meld markup template processing",
)