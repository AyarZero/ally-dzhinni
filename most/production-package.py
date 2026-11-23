"""Portable project archive. Only a JSON manifest and explicitly named media; never executable paths."""
import sys,json,zipfile,hashlib,re,stat
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
MAX=2*1024**3
MEDIA=re.compile(r'^[a-f0-9]{32}\.(png|jpe?g|webp|gif|mp4|webm|mov|mp3|wav|ogg|m4a)$')
EDITOR=re.compile(r'^editor/(?:media|exports|analysis|library/(?:sfx|elements|svg|fonts))/[^/\\\x00-\x1f]{1,200}\.(?:png|jpe?g|webp|gif|svg|mp4|webm|mov|mkv|mp3|wav|ogg|m4a|aac|flac|ttf|otf|woff2?|json|md)$',re.I)
def sha(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def package(source,manifest_path,target):
 m=json.loads(manifest_path.read_text(encoding='utf-8'));media=[];size=0
 for id in m.pop('mediaIds'):
  if not MEDIA.fullmatch(id):raise ValueError('Неверный идентификатор медиа')
  file=source/'media'/id
  if file.is_symlink() or not file.is_file() or not file.resolve().is_relative_to(source.resolve()):raise ValueError('Медиа отсутствует или недоступно')
  n=file.stat().st_size;size+=n
  if size>MAX:raise ValueError('Архив проекта превышает2ГБ')
  media.append({'id':id,'bytes':n,'sha256':sha(file)})
 m['media']=media
 editor=[]
 if m.get('editorTimeline'):
  for folder in ['media','exports','analysis','library/sfx','library/elements','library/svg','library/fonts']:
   base=source/'editor'/folder
   if not base.exists():continue
   for file in base.iterdir():
    name=file.relative_to(source).as_posix()
    if not EDITOR.fullmatch(name) or file.is_symlink() or not file.is_file() or not file.resolve().is_relative_to(source.resolve()):raise ValueError('Неверный файл монтажа')
    n=file.stat().st_size;size+=n
    if size>MAX:raise ValueError('Архив проекта превышает2ГБ')
    editor.append({'path':name,'bytes':n,'sha256':sha(file)})
 m['editorFiles']=editor
 if len(media)+len(editor)>2000:raise ValueError('В проекте больше2000файлов')
 encoded=json.dumps(m,ensure_ascii=False)
 if len(encoded.encode('utf-8'))>18*1024**2:raise ValueError('Манифест проекта превышает18МБ')
 with zipfile.ZipFile(target,'x',compression=zipfile.ZIP_STORED,allowZip64=True) as z:
  z.writestr('manifest.json',encoded,compress_type=zipfile.ZIP_DEFLATED)
  for item in media:z.write(source/'media'/item['id'],'media/'+item['id'])
  for item in editor:z.write(source/item['path'],item['path'])
def unpack(source,target):
 with zipfile.ZipFile(source) as z:
  infos=z.infolist();names=[x.filename for x in infos]
  if len(names)!=len(set(names)) or len(names)>2001 or 'manifest.json' not in names:raise ValueError('Повторные файлы или неверный архив')
  if sum(x.file_size for x in infos)>MAX:raise ValueError('Распакованный проект превышает2ГБ')
  if z.getinfo('manifest.json').file_size>18*1024**2:raise ValueError('Слишком большой манифест')
  for i in infos:
   if i.flag_bits&1 or stat.S_ISLNK(i.external_attr>>16):raise ValueError('Шифрованные файлы и ссылки запрещены')
   if i.filename!='manifest.json' and not(i.filename.startswith('media/') and MEDIA.fullmatch(i.filename[6:])) and not EDITOR.fullmatch(i.filename):raise ValueError('Недопустимый путь в архиве')
  m=json.loads(z.read('manifest.json'));media=m.get('media')
  if m.get('kind')!='ally-production-package' or m.get('schema')!=1 or not isinstance(media,list):raise ValueError('Неизвестный формат проекта')
  expected={'manifest.json'};ids=set()
  for item in media:
   id=item['id']
   if not MEDIA.fullmatch(id) or id in ids:raise ValueError('Неверное медиа')
   ids.add(id);expected.add('media/'+id)
  editor=m.get('editorFiles',[])
  if not isinstance(editor,list):raise ValueError('Неверный монтаж')
  for item in editor:
   if not EDITOR.fullmatch(item['path']) or item['path'] in expected:raise ValueError('Неверный файл монтажа')
   expected.add(item['path'])
  if expected!=set(names):raise ValueError('Состав архива не совпадает с манифестом')
  (target/'media').mkdir()
  for item in media:
   file=target/'media'/item['id'];info=z.getinfo('media/'+item['id'])
   if info.file_size!=item['bytes']:raise ValueError('Неверный размер медиа')
   with z.open(info) as inp,file.open('xb') as out:
    for chunk in iter(lambda:inp.read(1024*1024),b''):out.write(chunk)
    out.flush();__import__('os').fsync(out.fileno())
   if sha(file)!=item['sha256']:raise ValueError('Контрольная сумма медиа не совпала')
  for item in editor:
   file=target/item['path'];file.parent.mkdir(parents=True,exist_ok=True);info=z.getinfo(item['path'])
   if info.file_size!=item['bytes']:raise ValueError('Неверный размер монтажа')
   with z.open(info) as inp,file.open('xb') as out:
    for chunk in iter(lambda:inp.read(1024*1024),b''):out.write(chunk)
    out.flush();__import__('os').fsync(out.fileno())
   if sha(file)!=item['sha256']:raise ValueError('Контрольная сумма монтажа не совпала')
  timeline=m.get('editorTimeline')
  if timeline is not None:
   if not isinstance(timeline,dict) or not isinstance(timeline.get('clips'),list) or not isinstance(timeline.get('media'),list):raise ValueError('Неверный проект монтажа')
   (target/'editor').mkdir(exist_ok=True)
   (target/'editor'/'project.json').write_text(json.dumps(timeline,ensure_ascii=False),encoding='utf-8')
  (target/'manifest.json').write_text(json.dumps(m,ensure_ascii=False),encoding='utf-8')
if __name__=='__main__':
 try:
  if sys.argv[1]=='pack':package(Path(sys.argv[2]),Path(sys.argv[3]),Path(sys.argv[4]))
  elif sys.argv[1]=='unpack':unpack(Path(sys.argv[2]),Path(sys.argv[3]))
  else:raise ValueError('Неизвестная операция')
 except Exception as e:print(str(e),file=sys.stderr);sys.exit(1)
