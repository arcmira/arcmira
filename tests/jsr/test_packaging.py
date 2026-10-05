"""Verify the staging boundary and deterministic candidate output."""
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def hashes(root):
    return {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in root.rglob("*") if path.is_file()}


def prepare(output):
    return subprocess.run([sys.executable, str(ROOT / "scripts/prepare-jsr.py"), str(output)],
                          capture_output=True, text=True)


class PackagingTests(unittest.TestCase):
    def test_existing_output_is_untouched(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp)
            (output / "keep.txt").write_text("retain this file")
            before = hashes(output)
            result = prepare(output)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("existing files are never overwritten", result.stderr)
            self.assertEqual(hashes(output), before)

    def test_output_inside_repository_is_rejected(self):
        result = prepare(ROOT / ".jsr-forbidden-test-output")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Stage outside the repository", result.stderr)
        self.assertFalse((ROOT / ".jsr-forbidden-test-output").exists())

    def test_repeat_staging_is_identical_and_keeps_core_source(self):
        before = hashes(ROOT / "src")
        with tempfile.TemporaryDirectory() as tmp:
            first, second = Path(tmp) / "first", Path(tmp) / "second"
            for output in (first, second):
                result = prepare(output)
                self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(hashes(first), hashes(second))
            config = json.loads((first / "jsr.json").read_text())
            manifest = json.loads((first / "validation-manifest.json").read_text())
            published = {str(path.relative_to(first)) for path in (first / "src").rglob("*.ts")}
            published.update(["LICENSE", "README.md", "jsr.json"])
            self.assertTrue(published.issubset(manifest["files"]))
            self.assertNotIn("candidate_test.ts", config["publish"]["include"])
            self.assertFalse((first / "package.json").exists())
        self.assertEqual(hashes(ROOT / "src"), before)

    def test_parity_rejects_extra_runtime_export(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "candidate"
            result = prepare(output)
            self.assertEqual(result.returncode, 0, result.stderr)
            entry = output / "src/index.ts"
            entry.write_text(entry.read_text() + "\nexport const unexpectedRuntimeExport = true;\n")
            result = subprocess.run([sys.executable, str(ROOT / "scripts/check-jsr-exports.py"), str(output)],
                                    capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Runtime export mismatch: .", result.stderr)

    def test_parity_rejects_missing_sdk_entry(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "candidate"
            result = prepare(output)
            self.assertEqual(result.returncode, 0, result.stderr)
            config = json.loads((output / "jsr.json").read_text())
            del config["exports"]["./transcripts"]
            (output / "jsr.json").write_text(json.dumps(config))
            result = subprocess.run([sys.executable, str(ROOT / "scripts/check-jsr-exports.py"), str(output)],
                                    capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("JSR and npm SDK entry points differ", result.stderr)


if __name__ == "__main__":
    unittest.main()
