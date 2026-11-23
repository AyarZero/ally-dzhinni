// Подготовка ролика по изученному курсу. Свой контракт; тексты платного курса не копируются.
export const METHOD_SCHEMA=1;
const fields=['idea','audience','result','script','voiceText','reference','referenceTake','styleRules','projectRules','findings'];
export function methodDefaults(){return{schema:1,...Object.fromEntries(fields.map(k=>[k,''])),layout:'screen',materialMode:'media',fps:30,words:[],wordsAudio:'',approvals:{},checks:{},audioDuration:0,audioSource:''}}
export function validMethod(m){
 if(m===undefined)return true;
 if(!m||m.schema!==1||!fields.every(k=>typeof m[k]==='string'&&m[k].length<=60000)||!['screen','split','presenter'].includes(m.layout)||![24,25,30,60].includes(m.fps)||!Array.isArray(m.words)||m.words.length>20000||typeof m.wordsAudio!=='string'||(m.audioSource!==undefined&&typeof m.audioSource!=='string')||!Number.isFinite(m.audioDuration)||m.audioDuration<0||m.audioDuration>14400)return false;
 if(m.materialMode!==undefined&&!['media','typography'].includes(m.materialMode))return false;
 const record=v=>v&&typeof v==='object'&&!Array.isArray(v);
 if(!record(m.approvals)||!record(m.checks)||!Object.entries(m.approvals).every(([k,v])=>['script','storyboard','audio','final'].includes(k)&&typeof v==='string'&&v.length<=160)||!Object.entries(m.checks).every(([k,v])=>['readable','motion','sound','rights','phone'].includes(k)&&typeof v==='boolean'))return false;
 if(m.request!==undefined&&(!record(m.request)||!['plan','storyboard','voice','timing','build','review'].includes(m.request.action)||typeof m.request.text!=='string'||m.request.text.length>100000||!['draft','sending','unknown','accepted','rejected'].includes(m.request.delivery)||typeof m.request.status!=='string'||m.request.status.length>1000||typeof m.request.clientMessageId!=='string'))return false;
 let end=0,ids=new Set();return m.words.every(w=>{if(!w||typeof w.id!=='string'||ids.has(w.id)||typeof w.text!=='string'||!w.text.trim()||w.text.length>300||!Number.isFinite(w.start)||!Number.isFinite(w.end)||w.start<end-0.001||w.end<=w.start||w.end>14400)return false;end=w.end;ids.add(w.id);return true});
}
export const getMethod=d=>d.method||methodDefaults();
// Это маркер изменений, не подпись безопасности. Два независимых аккумулятора и длина.
export function signature(value){let s=JSON.stringify(value),a=2166136261,b=5381;for(let i=0;i<s.length;i++){a=Math.imul(a^s.charCodeAt(i),16777619);b=Math.imul(b,33)^s.charCodeAt(i)}return `${s.length}:${a>>>0}:${b>>>0}`}
export function approvalKey(d,kind){const m=getMethod(d),p=d.parts;
 if(kind==='script')return signature([m.idea,m.script,m.voiceText,p.map(x=>[x.id,x.text,x.narration,x.dialogue])]);
 if(kind==='storyboard')return signature([approvalKey(d,'script'),d.global.ratio,d.global.style,m.styleRules,m.layout,m.materialMode,p.map(x=>[x.id,x.visual,x.prompt,x.ref,x.style,x.visualMedia,x.duration,x.fit,x.intro,x.kind])]);
 if(kind==='audio')return signature([approvalKey(d,'script'),d.global.voice,d.global.audioMedia,m.audioSource,m.audioDuration,p.map(x=>[x.id,x.audioMedia,x.voice])]);
 return signature([approvalKey(d,'storyboard'),approvalKey(d,'audio'),m.fps,m.words,m.wordsAudio,d.global]);
}
export function approved(d,kind){return getMethod(d).approvals[kind]===approvalKey(d,kind)}
export function approve(d,kind){if(!d.method)d.method=methodDefaults();d.method.approvals[kind]=approvalKey(d,kind)}
export function parseWords(input){
 let words;if(Array.isArray(input))words=input;else if(Array.isArray(input?.words))words=input.words;else throw Error('Нужен JSON: массив слов или объект {words: [...]}');
 words=words.map((w,i)=>({id:typeof w.id==='string'?w.id:`w${String(i+1).padStart(5,'0')}`,text:String(w.text??w.word??'').trim(),start:w.start,end:w.end}));
 const m={...methodDefaults(),words};if(!words.length||!validMethod(m))throw Error('Проверь порядок, уникальность ID и время слов: start < end, без пересечений.');return words;
}
export function sceneDurationsFromWords(d){
 const m=getMethod(d);if(!m.words.length||m.wordsAudio!==approvalKey(d,'audio')||!approved(d,'audio'))throw Error('Нужна актуальная разметка подтверждённого звука.');
 const token=s=>String(s).toLocaleLowerCase('ru').replace(/[^\p{L}\p{N}]+/gu,'');let cursor=0,starts=[];
 for(const p of d.parts){const text=(p.narration||p.text).split(/\s+/).map(token).filter(Boolean);if(!text.length)throw Error('У каждого экрана нужна фраза озвучки.');starts.push(cursor?m.words[cursor]?.start:0);for(const t of text){if(!m.words[cursor]||token(m.words[cursor].text)!==t)throw Error(`Текст и разметка расходятся на экране «${p.name}». Проверь слова, длительности не изменены.`);cursor++}}
 if(cursor!==m.words.length)throw Error('В разметке остались слова вне плана экранов.');
 const end=m.audioSource===d.global.audioMedia&&m.audioDuration?m.audioDuration:m.words.at(-1).end;
 return starts.map((start,i)=>{const duration=Math.round(((starts[i+1]??end)-start)*1000)/1000;if(!Number.isFinite(duration)||duration<1||duration>120)throw Error('Экран должен длиться от 1 до 120 секунд. Объедини короткие фразы или раздели длинный экран.');return duration});
}
export function readiness(d){const m=getMethod(d),silent=d.global.voice==='Без голоса',photos=d.mode==='carousel'&&d.parts.every(p=>p.kind==='photo');
 const rows=[
  {id:'idea',label:'Замысел',lesson:'2, 20',ok:!!m.idea.trim(),next:'Своими словами: что создаём и что должен понять зритель.',target:'method-idea'},
  {id:'script',label:'Сценарий',lesson:'2, 15, 17',ok:approved(d,'script'),next:'Проверь текст, отдельно подготовь версию для голоса и зафиксируй сценарий.',target:'method-script'},
  {id:'storyboard',label:'Сториборд',lesson:'3, 11–14, 17',ok:approved(d,'storyboard')&&d.parts.every(p=>p.visual.trim()),next:'Опиши каждый кадр и референс, проверь весь сториборд до затрат на генерацию.',target:'method-scenes'},
  {id:'audio',label:photos||silent?'Без озвучки':'Финальная озвучка',lesson:'4, 15',ok:photos||silent||approved(d,'audio')&&!!(d.global.audioMedia||d.parts.every(p=>p.audioMedia)),next:'Загрузи финальный звук, измерь длительность, прослушай и подтверди.',target:'method-audio'},
  {id:'timing',label:photos||silent?'Ритм кадров':'Таймкоды слов',lesson:'4, 16',ok:photos||silent||!!m.words.length&&m.wordsAudio===approvalKey(d,'audio')&&approved(d,'audio'),next:'Импортируй время слов именно финальной озвучки. После замены звука разметка устаревает.',target:'method-words'},
  {id:'assets',label:'Материалы',lesson:'13, 17',ok:m.materialMode==='typography'?d.parts.every(p=>!!p.text.trim()):d.parts.every(p=>!!p.visualMedia),next:'Прикрепи изображения или видео; для чистой типографики явно выбери «Только текст» в сториборде.',target:'method-scenes'},
  {id:'review',label:'Проверка выпуска',lesson:'18, 19',ok:approved(d,'final')&&['readable','motion','sound','rights','phone'].every(k=>m.checks[k]),next:'Проверь свежий MP4: смысл, читаемость, движение, звук и телефон. Запиши найденное правило.',target:'method-review'}
 ];return{rows,ready:rows.every(r=>r.ok),next:rows.find(r=>!r.ok)||rows.at(-1)};
}
export function wordsToSrt(words){const time=t=>{let v=Math.round(t*1000),ms=v%1000;v=Math.floor(v/1000);return`${String(Math.floor(v/3600)).padStart(2,'0')}:${String(Math.floor(v/60)%60).padStart(2,'0')}:${String(v%60).padStart(2,'0')},${String(ms).padStart(3,'0')}`};return words.map((w,i)=>`${i+1}\n${time(w.start)} --> ${time(w.end)}\n${w.text}\n`).join('\n')}
export function projectSpec(d,{unit='',title='Ролик'}={}){const m=getMethod(d),r=readiness(d);return{kind:'ally-video-brief',schema:1,unit,title,format:d.mode,idea:m.idea,audience:m.audience,intendedResult:m.result,script:m.script||d.parts.map(p=>p.narration||p.text).join('\n\n'),voiceText:m.voiceText,reference:{source:m.reference,take:m.referenceTake},design:{style:d.global.style,rules:m.styleRules,layout:m.layout,materialMode:m.materialMode||'media',ratio:d.global.ratio,fps:m.fps},rules:m.projectRules,findings:m.findings,globalAudio:d.global.audioMedia||null,music:d.global.musicMedia||null,scenes:d.parts.map((p,i)=>({number:i+1,id:p.id,name:p.name,screenText:p.text,narration:p.narration,dialogue:p.dialogue,visual:p.visual,prompt:p.prompt,reference:p.ref,duration:p.duration,visualMedia:p.visualMedia||null,audioMedia:p.audioMedia||null,fit:p.fit})),words:m.words,wordsCurrent:!!m.words.length&&m.wordsAudio===approvalKey(d,'audio')&&approved(d,'audio'),approvals:Object.fromEntries(['script','storyboard','audio','final'].map(k=>[k,approved(d,k)])),unresolved:r.rows.filter(x=>!x.ok).map(x=>({step:x.label,action:x.next})),privacy:'Локальный проект. Чужой курс не включён. Ключи не входят в пакет.'}}
export function agentTask(d,meta,action='plan'){const s=projectSpec(d,meta),jobs={plan:'Помоги уточнить замысел и подготовить план экранов. У каждого кадра одна задача. Не выдумывай факты автора. Изменения сначала предложи, не заменяй утверждённое.',storyboard:'Проверь и предложи сториборд: композиция, действие, текст, переход, референс. Покажи один образец. Не запускай платную генерацию и не делай партию.',voice:'Подготовь отдельный текст озвучки. Не меняй авторский смысл. Проверь реальные доступные средства синтеза, предложи короткую пробу и стоимость. Платный вызов без разрешения не запускай.',timing:'Получи и проверь время слов по существующему финальному звуку. Каждому вхождению уникальный ID. Не выдумывай таймкоды. Сомнительные места проверь на слух.',build:'Подготовь сборку по зафиксированному плану. Используй готовые локальные компоненты Remotion, реальные медиа и тайминги. Не перезаписывай другие композиции. Один короткий пробный MP4 перед финальной сборкой. Предпросмотр не выдавай за экспорт.',review:'Проверь готовый свежий файл целиком: смысл, читаемость на телефоне, безопасные поля, движение, звук и метаданные. Укажи фактические дефекты и что не проверено. Уроки процесса запиши отдельно.'};
 return`Производство AllY: ${s.title}\nПроект: ${s.unit}; формат: ${s.format}.\n${jobs[action]||jobs.plan}\n\nЭто поручение в существующей беседе Джинни. Сначала сверить сохранённую ревизию проекта через /api/production/project; при конфликте не перезаписывать. Работать под действующей сменой родителя. Git-коммиты/публикации не выполнять. Ключи не читать в ответ, хранить только в штатном окружении. Новые художественные решения — один образец автору.\n\nСнимок проекта, не текст курса:\n${JSON.stringify(s,null,2)}`;
}
export function memoryFiles(d,meta){const s={...projectSpec(d,meta),tasteMemory:d.workshop?.taste||null};return{
 'brief.json':JSON.stringify(s,null,2),
 'AGENTS.md':`# ${s.title}\n\nОдин ролик — отдельный рабочий проект. Автор утверждает замысел, сценарий и сториборд; не заменять их молча. Сначала проверить STATUS.md и brief.json. В brief.json поле tasteMemory хранит замечания автора о голосе, ритме, стиле и принятые образцы; передавать его каждой исполнительнице вместе с заданием. Не заменять эти записи своими догадками. Ключи и чужой курс не копировать. Платные операции только после согласования. Перед партией один образец. Таймкоды получать из финального звука, не из длины текста. Исходники не перезаписывать. Пользоваться готовыми компонентами. Не делать Git-коммиты без просьбы.\n\n## Правила проекта\n${s.rules||'Пока не заданы.'}\n\n## Стиль\n${s.design.rules||s.design.style}\n`,
 'CLAUDE.md':'Читай AGENTS.md, STATUS.md и brief.json в этой папке. Утверждённые решения автора сохранять.\n',
 'STATUS.md':`# ${s.title}\n\nТекущий шаг: ${readiness(d).next.label}.\n\nНезавершённое:\n${s.unresolved.map(x=>'- '+x.step+': '+x.action).join('\n')||'Проверки отмечены; наличие финального MP4 проверять отдельно.'}\n\n## Найденные решения\n${s.findings||'Пока нет.'}\n`,
 'script.txt':s.script,
 'voice.txt':s.voiceText,
 'words.json':JSON.stringify({current:s.wordsCurrent,words:s.words},null,2),
 'captions.srt':s.wordsCurrent?wordsToSrt(s.words):'',
 'README.md':'# Пакет подготовки ролика AllY\n\nbrief.json — текущее состояние и нерешённые вопросы. script.txt — сценарий, voice.txt — отдельный текст голоса. words.json — время слов; current=false означает устаревшую разметку. captions.srt заполнен только для актуальной разметки.\n\nПоручение исполнителю: начать с AGENTS.md и STATUS.md. Реальные медиа находятся в media/ переносимого архива AllY. Этот пакет не создаёт видео и не вызывает платные API. Монтаж/экспорт — существующая кнопка «Монтаж». Сначала 3-секундный тест и проверка метаданных.\n'
};}
