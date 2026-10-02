"""Install generated source. All generator fixes are exact checked patches."""
from pathlib import Path
import shutil
import subprocess

root = Path(__file__).resolve().parents[1]
generated = root / '.generated/typescript'
patch = root / 'scripts/generator-fixes/typescript-timeout.patch'
subprocess.run(['git', 'apply', '--check', str(patch)], cwd=generated, check=True)
subprocess.run(['git', 'apply', str(patch)], cwd=generated, check=True)
# Preserve no stale generated files, and install only after the checked fix succeeds.
shutil.rmtree(root / 'src')
shutil.copytree(generated, root / 'src')
