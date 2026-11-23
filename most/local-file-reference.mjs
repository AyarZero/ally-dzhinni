// A reference grants access to one user-selected file; no copying or public download URL.
import { stat, realpath, open } from 'node:fs/promises'
import { isAbsolute, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes, createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { browserFileCandidates } from './browser-file-path.mjs'

const bad = message => Object.assign(new Error(message), { status: 400 })
export function localFileReferences({ pick = pickLocalFile, candidates = browserFileCandidates } = {}) {
  const grants = new Map()
  const pendingDrops = new Map()
  async function inspect(input) {
    let path = String(input || '').trim().replace(/^"(.*)"$/s, '$1')
    if (/^file:/i.test(path)) { try { path = fileURLToPath(path) } catch { throw bad('Некорректная ссылка на файл') } }
    if (!isAbsolute(path) || /[\r\n\x00]/.test(path) || /^[/\\]{2}[?.]/.test(path))
      throw bad('Укажи полный путь к файлу на этом компьютере, например D:\\APK\\Notion.apk')
    try {
      path = await realpath(path)
      const info = await stat(path)
      if (!info.isFile()) throw bad('Выбери файл, а не папку')
      return { path, name: basename(path), size: info.size, mtimeMs: info.mtimeMs }
    } catch (error) { if (error.status) throw error; throw bad('Файл не найден или недоступен на компьютере') }
  }
  return {
    async create(data, { signal } = {}) {
      let path
      if(data.drop === 'begin') {
        if(typeof data.name!=='string'||!data.name||/[\\/\r\n\x00]/.test(data.name)||data.name.length>260||!Number.isSafeInteger(data.size)||data.size<=50*1024*1024)throw bad('Некорректный перетащенный файл')
        for(const [key,value] of pendingDrops)if(Date.now()-value.at>120000)pendingDrops.delete(key)
        if(pendingDrops.size>=20)throw bad('Дождись прикрепления предыдущих файлов')
        const before=await candidates(data.name,data.size,{signal}),dropId=randomBytes(24).toString('hex')
        pendingDrops.set(dropId,{name:data.name,size:data.size,before:new Set(before.map(row=>row.key)),at:Date.now()})
        return {ok:true,dropId}
      }
      if(data.drop === 'finish') {
        const drop=pendingDrops.get(data.dropId);pendingDrops.delete(data.dropId)
        if(!drop||Date.now()-drop.at>120000||typeof data.sampleHash!=='string'||!/^[a-f0-9]{64}$/.test(data.sampleHash))throw bad('Не удалось сверить перетащенный файл — перетащи его ещё раз')
        const rows=await candidates(drop.name,drop.size,{signal}),fresh=rows.filter(row=>!drop.before.has(row.key))
        const paths=[...new Set((fresh.length?fresh:rows).map(row=>row.path))],matches=[]
        for(const candidate of paths){
          try {
            const info=await inspect(candidate)
            if(info.size!==drop.size)continue
            if(await sampleHash(info.path,info.size)===data.sampleHash)matches.push(info.path)
          }catch{}
        }
        if(matches.length!==1)throw bad(matches.length?'Не удалось однозначно определить исходный путь. Перетащи файл ещё раз':'Не удалось получить путь файла из браузера. Перетащи файл ещё раз')
        path=matches[0]
      } else path = data.pick === true ? await pick({ signal }) : data.path
      if (!path) return { ok: true, cancelled: true }
      const reference = { ...await inspect(path), id: randomBytes(24).toString('hex') }
      // Avoid an unbounded map without expiring a pending composer after a short pause.
      if (grants.size >= 1000) grants.delete(grants.keys().next().value)
      grants.set(reference.id, reference)
      return { ok: true, reference }
    },
    async resolve(ids = []) {
      if (!Array.isArray(ids) || ids.length > 20) throw bad('Можно отправить до 20 вложений за раз')
      const result = []
      for (const id of ids) {
        const grant = typeof id === 'string' && grants.get(id)
        if (!grant) throw bad('Ссылка на файл устарела — прикрепи файл по пути заново')
        const now = await inspect(grant.path)
        if (now.path !== grant.path || now.size !== grant.size || now.mtimeMs !== grant.mtimeMs)
          throw bad('Файл изменился после выбора — прикрепи его заново')
        result.push(now)
      }
      return result
    },
  }
}

async function sampleHash(path,size){
 const file=await open(path,'r'),hash=createHash('sha256'),length=Math.min(65536,size)
 try{
  for(const position of [0,Math.floor((size-length)/2),size-length]){
   const buffer=Buffer.alloc(length);let offset=0
   while(offset<length){const result=await file.read(buffer,offset,length-offset,position+offset);if(!result.bytesRead)throw new Error('File changed');offset+=result.bytesRead}
   hash.update(buffer)
  }
  return hash.digest('hex')
 }finally{await file.close()}
}

let choosing = false
export async function pickLocalFile({ signal } = {}) {
  if (process.platform !== 'win32') throw bad('Вставь полный путь к файлу: системный выбор доступен в Windows')
  if (choosing) throw bad('Окно выбора файла уже открыто')
  choosing = true
  const script = `[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Windows.Forms
$picker=New-Object System.Windows.Forms.OpenFileDialog
$picker.Title='AllY — прикрепить файл без загрузки'
$picker.CheckFileExists=$true
$picker.Multiselect=$false
$owner=New-Object System.Windows.Forms.Form
$owner.TopMost=$true
try { if($picker.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK){[Console]::Write($picker.FileName)} }
finally { $picker.Dispose(); $owner.Dispose() }`
  try {
    return await new Promise((resolve, reject) => execFile('powershell.exe', ['-NoProfile', '-STA', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { windowsHide: true, encoding: 'utf8', timeout: 300000, maxBuffer: 32768, signal }, (error, stdout) => error ? reject(bad('Не удалось выбрать файл. Вставь полный путь вручную')) : resolve(stdout.trim())))
  } finally { choosing = false }
}
