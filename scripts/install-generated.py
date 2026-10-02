"""Install generated source. All generator fixes are exact checked patches."""
from pathlib import Path
import shutil
import subprocess

root = Path(__file__).resolve().parents[1]
generated = root / '.generated/typescript'
patch = root / 'scripts/generator-fixes/typescript-timeout.patch'
subprocess.run(['git', 'apply', '--check', str(patch)], cwd=generated, check=True)
subprocess.run(['git', 'apply', str(patch)], cwd=generated, check=True)
# src/wrapper/ is maintained by hand (transcripts.prepareAndWait); everything else is replaced.
wrapper = {path.relative_to(root / 'src'): path.read_bytes() for path in (root / 'src/wrapper').rglob('*') if path.is_file()}
# Preserve no stale generated files, and install only after the checked fix succeeds.
shutil.rmtree(root / 'src')
shutil.copytree(generated, root / 'src')
for relative, content in wrapper.items():
    (root / 'src' / relative).parent.mkdir(parents=True, exist_ok=True)
    (root / 'src' / relative).write_bytes(content)
index = root / 'src/index.ts'
generated_export = 'export { ArcmiraClient } from "./Client.js";\n'
wrapped_export = 'export {\n    ArcmiraClient,\n    PreparationError,\n    PreparationFailedError,\n    PreparationTimeoutError,\n    PremiumUnavailableError,\n    type PrepareAndWaitRequest,\n    TranscriptsClient,\n} from "./wrapper/ArcmiraClient.js";\n'
text = index.read_text()
if generated_export not in text:
    raise SystemExit(f'src/index.ts no longer exports ArcmiraClient as {generated_export.strip()!r}; update install-generated.py')
index.write_text(text.replace(generated_export, wrapped_export))
