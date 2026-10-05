"""Stage the SDK for JSR without modifying generated npm source."""
import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMPORT = re.compile(r'''((?:from\s+|import\s*\()\s*["'])(\.[^"']+)\.js(["'])''')


def prepare(output: Path) -> None:
    output = output.resolve()
    if output == ROOT or ROOT in output.parents:
        raise ValueError("Stage outside the repository so npm metadata and Git state cannot leak into JSR.")
    if output.exists():
        raise ValueError("Use a new output directory; existing files are never overwritten.")
    package = json.loads((ROOT / "package.json").read_text())
    version = package["version"]
    if (ROOT / "src/version.ts").read_text().strip() != f'export const SDK_VERSION = "{version}";':
        raise ValueError("SDK source and package version differ.")
    output.mkdir(parents=True)
    shutil.copytree(ROOT / "src", output / "src")
    shutil.copyfile(ROOT / "LICENSE", output / "LICENSE")
    shutil.copyfile(ROOT / "jsr/README.md", output / "README.md")
    shutil.copyfile(ROOT / "tests/jsr/candidate_test.ts", output / "candidate_test.ts")
    changed_files = 0
    rewrites = 0
    for path in sorted((output / "src").rglob("*.ts")):
        def rewrite(match: re.Match) -> str:
            if not (path.parent / (match.group(2) + ".ts")).is_file():
                raise ValueError(f"Unresolved source import in {path.relative_to(output)}: {match.group(2)}")
            return match.group(1) + match.group(2) + ".ts" + match.group(3)
        text, count = IMPORT.subn(rewrite, path.read_text())
        if count:
            path.write_text(text)
            changed_files += 1
            rewrites += count
    patches = [
        ("src/core/runtime/runtime.ts", 'typeof window !== "undefined" && typeof window.document !== "undefined"', 'typeof window !== "undefined" && "document" in window && typeof window.document !== "undefined"'),
        ("src/core/runtime/runtime.ts", 'typeof navigator !== "undefined" && navigator?.product === "ReactNative"', 'typeof navigator !== "undefined" && "product" in navigator && navigator.product === "ReactNative"'),
        ("src/errors/ArcmiraError.ts", "public readonly cause?: unknown;", "public override readonly cause?: unknown;"),
    ]
    for relative, before, after in patches:
        path = output / relative
        text = path.read_text()
        if text.count(before) != 1:
            raise ValueError(f"Review the staged compatibility patch for {relative}; its source changed.")
        path.write_text(text.replace(before, after))
    root = output / "src/index.ts"
    if "BearerAuthProvider" in root.read_text():
        raise ValueError("Review the root BearerAuthProvider export; its source changed.")
    root.write_text(root.read_text() + '\nexport type { BearerAuthProvider } from "./auth/BearerAuthProvider.ts";\n')
    exports = {}
    for name, entry in package["exports"].items():
        if name == "./package.json":
            continue
        esm = entry["import"]["default"]
        if not esm.startswith("./dist/esm/") or not esm.endswith(".mjs"):
            raise ValueError(f"Review SDK export mapping: {name}")
        source = esm.replace("./dist/esm/", "./src/", 1).removesuffix(".mjs") + ".ts"
        if not (output / source).is_file():
            raise ValueError(f"Missing SDK source entry: {source}")
        exports[name] = source
    config = {
        "name": "@arcmira/sdk", "version": version, "license": package["license"],
        "exports": exports,
        "publish": {"include": ["src/**/*.ts", "README.md", "LICENSE", "jsr.json"]},
    }
    (output / "jsr.json").write_text(json.dumps(config, indent=2) + "\n")
    manifest = {
        "version": version, "sdk_exports": len(exports),
        "relative_import_files": changed_files, "relative_import_rewrites": rewrites,
        "staged_adjustments": ["Two Deno runtime property guards", "Error.cause override", "Root BearerAuthProvider type export"],
        "files": {str(path.relative_to(output)): hashlib.sha256(path.read_bytes()).hexdigest()
                  for path in sorted(output.rglob("*")) if path.is_file()},
    }
    (output / "validation-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Staged SDK {version}: {len(exports)} exports; {rewrites} import rewrites in {changed_files} files.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    prepare(parser.parse_args().output)
