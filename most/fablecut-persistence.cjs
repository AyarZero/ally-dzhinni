'use strict';
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),path=require('node:path');
function validTimeline(data){
 const text=v=>typeof v==='string'&&v.length<=20000;
 const src=v=>{try{return text(v)&&/^\/(media|library)\/[^?#]+$/.test(v)&&!decodeURIComponent(v).split(/[\\/]/).some(p=>p==='..'||p==='.'||p.includes('\0'))}catch{return false}};
 return !!(data&&Number.isSafeInteger(data.revision)&&data.revision>=0&&text(data.name)&&Number.isFinite(data.width)&&Number.isFinite(data.height)&&data.width>=16&&data.height>=16&&data.width<=4096&&data.height<=4096&&Number.isFinite(data.fps)&&data.fps>0&&data.fps<=60&&Array.isArray(data.media)&&data.media.length<=2000&&data.media.every(m=>m&&text(m.id)&&text(m.name)&&src(m.src)&&['video','audio','image','svg'].includes(m.kind))&&Array.isArray(data.clips)&&data.clips.length<=5000&&data.clips.every(c=>c&&text(c.id)&&text(c.name)&&['video','audio','image','svg','text','adjust'].includes(c.kind)&&/^[VA][1-4]$/.test(c.track)&&Number.isFinite(c.start)&&c.start>=0&&Number.isFinite(c.duration)&&c.duration>0&&c.duration<=7200&&c.props&&typeof c.props==='object'));
}
function openStore(root){
 const db=new DatabaseSync(path.join(root,'history.sqlite'));
 db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=EXTRA; CREATE TABLE IF NOT EXISTS saves (revision INTEGER PRIMARY KEY, payload TEXT NOT NULL, at TEXT NOT NULL)');
 const latest=()=>db.prepare('SELECT payload FROM saves ORDER BY revision DESC LIMIT 1').get();
 const read=()=>{const row=latest();return row?JSON.parse(row.payload):JSON.parse(fs.readFileSync(path.join(root,'project.json'),'utf8'))};
 function write(data){
  if(!validTimeline(data))throw Error('Некорректный монтаж');
  db.exec('BEGIN IMMEDIATE');
  try{const row=latest(),old=row?JSON.parse(row.payload):read();if(data.revision!==old.revision+1)throw Error('CONFLICT');
   db.prepare('INSERT INTO saves VALUES (?,?,?)').run(data.revision,JSON.stringify(data),new Date().toISOString());
   db.exec('DELETE FROM saves WHERE revision NOT IN (SELECT revision FROM saves ORDER BY revision DESC LIMIT 20); COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e}
  // SQLite is authoritative. A failed mirror never invalidates an acknowledged commit.
  try{const tmp=path.join(root,'project.json.tmp'),fd=fs.openSync(tmp,'w');try{fs.writeFileSync(fd,JSON.stringify(data,null,2));fs.fsyncSync(fd)}finally{fs.closeSync(fd)}fs.renameSync(tmp,path.join(root,'project.json'))}catch(e){console.error('Зеркало монтажа: '+e.message)}
 }
 return{read,write,close:()=>db.close()};
}
module.exports={openStore,validTimeline};
