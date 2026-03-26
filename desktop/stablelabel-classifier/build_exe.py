"""
Build the StableLabel Classifier as a standalone PyInstaller executable.

Usage:
    pip install pyinstaller
    python build_exe.py

Output:
    dist/stablelabel-classifier[.exe]
"""

import os
import subprocess
import sys
import spacy


def main():
    # Locate the spaCy model data directory for bundling
    nlp = spacy.load("en_core_web_lg")
    model_path = str(nlp.path)
    print(f"spaCy model path: {model_path}")

    # PyInstaller --add-data uses ':' on Linux/macOS, ';' on Windows
    sep = ';' if os.name == 'nt' else ':'

    cmd = [
        sys.executable, "-m", "PyInstaller",
        # Use --onedir instead of --onefile — en_core_web_lg is ~560MB,
        # --onefile would extract to a temp dir on every launch (slow + 1GB temp usage)
        "--onedir",
        "--name", "stablelabel-classifier",
        # Presidio hidden imports
        "--hidden-import", "presidio_analyzer",
        "--hidden-import", "presidio_analyzer.predefined_recognizers",
        "--hidden-import", "presidio_analyzer.nlp_engine.spacy_nlp_engine",
        "--hidden-import", "presidio_analyzer.context_aware_enhancers",
        # spaCy hidden imports (dynamic loading)
        "--hidden-import", "spacy",
        "--hidden-import", "spacy.lang.en",
        "--hidden-import", "en_core_web_lg",
        "--hidden-import", "thinc.backends.numpy_ops",
        # Bundle the spaCy model data
        "--add-data", f"{model_path}{sep}en_core_web_lg",
        # Collect all submodules for presidio, spacy, and thinc
        "--collect-submodules", "presidio_analyzer",
        "--collect-submodules", "spacy",
        "--collect-submodules", "thinc",
        "--collect-data", "presidio_analyzer",
        "classifier_service.py",
    ]

    print("Running PyInstaller:", " ".join(cmd))
    subprocess.run(cmd, check=True)
    print("\nBuild complete! Output: dist/stablelabel-classifier/")


if __name__ == "__main__":
    main()
