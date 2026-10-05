"""Compare staged JSR entry points with the locally built npm ESM SDK."""
import argparse
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def check(candidate: Path) -> None:
    candidate = candidate.resolve()
    package = json.loads((ROOT / "package.json").read_text())
    config = json.loads((candidate / "jsr.json").read_text())
    npm_exports = {name: entry for name, entry in package["exports"].items() if name != "./package.json"}
    if set(npm_exports) != set(config["exports"]):
        raise ValueError("JSR and npm SDK entry points differ.")
    checks = []
    for i, (name, entry) in enumerate(npm_exports.items()):
        npm = ROOT / entry["import"]["default"]
        staged = candidate / config["exports"][name]
        if not npm.is_file() or not staged.is_file():
            raise ValueError(f"Build the npm SDK and stage JSR before checking {name}.")
        checks.extend([
            f'import * as npm{i} from {json.dumps(npm.as_uri())};',
            f'import * as jsr{i} from {json.dumps(staged.as_uri())};',
            '{',
            f'const expected = Object.keys(npm{i}).sort();',
            f'const actual = Object.keys(jsr{i}).sort();',
            f'if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error("Runtime export mismatch: {name}");',
            f'console.log({json.dumps(name)}, JSON.stringify(expected));',
            '}',
        ])
    script = candidate / "export-parity.ts"
    script.write_text("\n".join(checks) + "\n")
    subprocess.run(["deno", "run", str(script)], check=True, cwd=candidate)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("candidate", type=Path)
    check(parser.parse_args().candidate)
