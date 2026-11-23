import {spawn} from 'node:child_process'
import {join} from 'node:path'

// Same task service for desktop and the paired Android client. The settings envelope
// preserves compatibility with existing authenticated gateways; it never calls a model.
export function taskEditor(repo, payload, uploads) {
  return new Promise((resolve,reject)=>{
    const child=spawn('python',['-X','utf8',join(repo,'act/scripts/task_editor_store.py'),uploads],
      {cwd:repo,windowsHide:true,stdio:['pipe','pipe','pipe']})
    let out='',err=''
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8')
    child.stdout.on('data',b=>{out+=b.toString('utf8');if(out.length>4*1024*1024)child.kill()})
    child.stderr.on('data',b=>{err+=b.toString('utf8')})
    child.on('error',reject)
    child.on('close',code=>{try{if(code!==0)throw new Error('Сервис задач завершился без ответа');resolve(JSON.parse(out))}catch(e){reject(e)}})
    child.stdin.on('error',()=>{})
    child.stdin.end(JSON.stringify(payload))
  })
}
