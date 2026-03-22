"""
Build the StableLabel Classifier as a standalone PyInstaller executable.

Usage:
    pip install pyinstaller
    python build_exe.py

Output:
    dist/stablelabel-classifier[.exe]
"""

import subprocess
import sys
import spacy


def main():
    # Locate the spaCy model data directory for bundling
    nlp = spacy.load("en_core_web_lg")
    model_path = nlp.path
    print(f"spaCy model path: {model_path}")

    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onefile",
        "--name", "stablelabel-classifier",
        "--hidden-import", "presidio_analyzer",
        "--hidden-import", "presidio_analyzer.predefined_recognizers",
        "--hidden-import", "spacy",
        "--hidden-import", "en_core_web_lg",
        # Bundle the spaCy model data
        "--add-data", f"{model_path}:en_core_web_lg",
        # Collect all presidio recognizers
        "--collect-submodules", "presidio_analyzer",
        "--collect-data", "presidio_analyzer",
        "classifier_service.py",
    ]

    print("Running PyInstaller:", " ".join(cmd))
    subprocess.run(cmd, check=True)
    print("\nBuild complete! Output: dist/stablelabel-classifier")


if __name__ == "__main__":
    main()
