// Встраивание по умолчанию запрещено. Приватная локальная проба разрешает только явные loopback-окна.
export function windowSecurity(env=process.env){
 let origins=[]
 try{const values=JSON.parse(env.DZHINNI_PREVIEW_ANCESTORS||'[]');if(!Array.isArray(values)||values.length>4)throw Error('origins')
  origins=values.map(value=>{const url=new URL(value);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||url.origin!==value)throw Error('origin');return url.origin})
 }catch{origins=[]}
 return origins.length?{'content-security-policy':'frame-ancestors '+origins.join(' ')}:{'x-frame-options':'DENY','content-security-policy':"frame-ancestors 'none'"}
}
