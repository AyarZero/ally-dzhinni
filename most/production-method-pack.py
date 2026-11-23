"""ZIP подготовительных документов: только белый список имён, без распаковки и сети."""
import json
import sys
import zipfile
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
allowed={'brief.json','AGENTS.md','CLAUDE.md','STATUS.md','script.txt','voice.txt','words.json','captions.srt','README.md'}
def pack(source, target):
    files=json.loads(source.read_text(encoding='utf-8'))
    if set(files)!=allowed or not all(isinstance(v,str) for v in files.values()):
        raise ValueError('Некорректный пакет подготовки')
    if sum(len(v.encode('utf-8')) for v in files.values())>4*1024**2:
        raise ValueError('Пакет подготовки больше 4 МБ')
    with zipfile.ZipFile(target,'x',compression=zipfile.ZIP_DEFLATED) as z:
        for name,value in files.items():
            z.writestr(name,value)
if __name__=='__main__':
    pack(Path(sys.argv[1]),Path(sys.argv[2]))
