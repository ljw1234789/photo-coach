"""Build the downloadable Mac assistant reproducibly, without local credentials."""
from pathlib import Path
import shutil
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
FILES = ['worker.py', 'result_schema.json', 'requirements.txt', 'download_model.py',
         '启动助手.command', '使用说明.txt']


def package(destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name in FILES:
            info = zipfile.ZipInfo('取景助手/' + name, (2026, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (0o100755 if name.endswith('.command') else 0o100644) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, (ROOT / 'assistant' / name).read_bytes())
        info = zipfile.ZipInfo('取景助手/LICENSE.txt', (2026, 1, 1, 0, 0, 0))
        info.create_system = 3
        info.external_attr = 0o100644 << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, (ROOT / 'LICENSE').read_bytes())


if __name__ == '__main__':
    target = ROOT / 'dist/downloads/photo-coach-assistant.zip'
    schema = ROOT / 'dist/downloads/schema.sql'
    if '--check' in sys.argv:
        with tempfile.TemporaryDirectory() as directory:
            fresh = Path(directory) / 'assistant.zip'
            package(fresh)
            if not target.exists() or fresh.read_bytes() != target.read_bytes():
                raise SystemExit('Assistant ZIP is out of date: run python3 scripts/package_assistant.py')
        if schema.read_bytes() != (ROOT / 'supabase/schema.sql').read_bytes():
            raise SystemExit('Downloadable SQL is out of date: run python3 scripts/package_assistant.py')
        print('PASS: assistant package and SQL match source')
    else:
        package(target)
        shutil.copyfile(ROOT / 'supabase/schema.sql', schema)
        print(target)
