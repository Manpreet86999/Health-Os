"""Collect local Edge Function dependencies without reading environment secrets."""
import json
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
entry = f'supabase/functions/{sys.argv[1]}/index.ts'
seen = {}

def collect(name):
    path = root / name
    if not path.exists() and path.suffix == '.js':
        path = path.with_suffix('.ts')
    name = path.relative_to(root).as_posix()
    if name in seen:
        return
    content = path.read_text(encoding='utf-8')
    if '--without-assets' in sys.argv and name == 'src/shared/report-email-assets.js':
        seen[name] = ''
        return
    seen[name] = content
    for dependency in re.findall(r'''(?:from\s*|import\s*)["'](\.[^"']+)["']''', content):
        target = (path.parent / dependency).resolve()
        collect(target.relative_to(root).as_posix())

collect(entry)
config = f'supabase/functions/{sys.argv[1]}/deno.json'
if (root / config).exists():
    collect(config)
print(json.dumps({'entrypoint_path':entry, 'files':[{'name':name,'content':content} for name,content in seen.items()], 'import_map_path':config if config in seen else None}))
