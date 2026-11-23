// Память принадлежит документу проекта, а не сессии поставщика модели.
export const TASTE_FIELDS={visual:'Образы и визуальный стиль',voice:'Голос и манера речи',rhythm:'Ритм и темп',avoid:'Чего избегать'};
export function validTaste(t){
 if(t===undefined)return true;
 return t&&t.schema===1&&t.notes&&Object.keys(TASTE_FIELDS).every(k=>typeof t.notes[k]==='string'&&t.notes[k].length<=2000)
  &&Array.isArray(t.events)&&t.events.length<=100&&t.events.every(e=>e&&typeof e.id==='string'&&e.id.length<=200&&typeof e.at==='string'&&e.at.length<=40&&['accepted','correction','rejected'].includes(e.kind)&&typeof e.subject==='string'&&e.subject.length<=200&&typeof e.detail==='string'&&e.detail.length<=6000);
}
export function tasteMemory(d){
 if(!d.workshop)throw Error('Сначала открой проект');
 return d.workshop.taste??={schema:1,notes:Object.fromEntries(Object.keys(TASTE_FIELDS).map(k=>[k,''])),events:[]};
}
export function rememberTaste(d,{kind,subject,detail}){
 const t=tasteMemory(d);
 if(!['accepted','correction','rejected'].includes(kind)||!String(detail||'').trim()||String(detail).length>6000||String(subject||'').length>200)throw Error('Запись памяти: укажи решение до 6000 знаков');
 if(t.events.some(e=>e.kind===kind&&e.subject===subject&&e.detail===detail))return;
 if(t.events.length>=100)throw Error('В памяти 100 решений. Удали ненужную запись перед добавлением новой.');
 t.events.push({id:crypto.randomUUID(),at:new Date().toISOString(),kind,subject:String(subject||''),detail:String(detail)});
}
export function tasteContext(d){
 const t=d.workshop?.taste;
 return {scope:'Только этот проект. Записи пользователя и принятые образцы; не обобщать на все будущие работы.',
  notes:t?.notes||Object.fromEntries(Object.keys(TASTE_FIELDS).map(k=>[k,''])),
  decisions:t?.events||[],totalDecisions:t?.events.length||0,
  instruction:'Учитывай голос, ритм и замечания. Принятый образец не означает одобрение всех его элементов. При конфликте старых решений уточни у человека. Не меняй утверждённое сама.'};
}
