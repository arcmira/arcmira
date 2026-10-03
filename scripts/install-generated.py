"""Install generated source. All generator fixes are exact checked patches."""
import json
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
# package.json exports one subpath per generated resource, so the list follows the regeneration.
package_path = root / 'package.json'
package = json.loads(package_path.read_text())
def entry(directory):
    stem = f'api/resources/{directory}/exports' if directory else 'index'
    return {
        'import': {'types': f'./dist/esm/{stem}.d.mts', 'default': f'./dist/esm/{stem}.mjs'},
        'require': {'types': f'./dist/cjs/{stem}.d.ts', 'default': f'./dist/cjs/{stem}.js'},
        'default': f'./dist/cjs/{stem}.js',
    }
resources = sorted(
    (str(path.parent.relative_to(root / 'src/api/resources')) for path in (root / 'src/api/resources').rglob('exports.ts')),
    key=lambda directory: (directory.count('/'), directory),
)
exports = {'.': entry('')}
for directory in resources:
    exports['./' + directory.replace('/resources/', '/')] = entry(directory)
exports['./package.json'] = './package.json'
package['exports'] = exports
package_path.write_text(json.dumps(package, indent=2, ensure_ascii=False) + '\n')
