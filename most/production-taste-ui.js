import {TASTE_FIELDS,tasteMemory,rememberTaste} from './production-taste.js';
const drafts=new WeakMap();
export function mountTasteMemory(parent,{getDoc,commit,toast}){
 const make=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e};
 const d=getDoc();if(!drafts.has(d))drafts.set(d,{open:false,detail:'',kind:'correction'});const state=drafts.get(d);
 const box=make('details');box.id='ws-taste-memory';box.open=state.open;box.ontoggle=()=>{state.open=box.open};box.append(make('summary','Память вкуса проекта'));
 box.append(make('p','Твои замечания и принятые образцы передаются Джинни при смене модели. Принятие сцены не делает все её детали общим правилом.'));
 const t=tasteMemory(getDoc());
 for(const [key,title]of Object.entries(TASTE_FIELDS)){
  const label=make('label',title),input=make('textarea');label.className='ws-field';input.value=t.notes[key];input.maxLength=2000;
  input.oninput=()=>{t.notes[key]=input.value;commit('release')};label.append(input);box.append(label);
 }
 const kind=make('select');for(const [value,title]of [['correction','Моя правка'],['rejected','Не подходит'],['accepted','Мне подходит']]){const o=make('option',title);o.value=value;kind.append(o)}
 kind.value=state.kind;kind.onchange=()=>{state.kind=kind.value};kind.setAttribute('aria-label','Тип решения');const detail=make('textarea');detail.placeholder='Что именно подходит или нужно изменить и почему';detail.maxLength=6000;detail.value=state.detail;detail.oninput=()=>{state.detail=detail.value};
 const list=make('div');function draw(){list.replaceChildren();for(const e of [...t.events].reverse()){
  const row=make('article');row.append(make('strong',({accepted:'Принято',correction:'Правка',rejected:'Не подходит'})[e.kind]+' · '+e.subject),make('p',e.detail));
  const remove=make('button','Убрать из памяти');remove.type='button';remove.onclick=()=>{t.events=t.events.filter(x=>x.id!==e.id);commit('release');draw()};row.append(remove);list.append(row);
 }}
 const add=make('button','Сохранить замечание');add.type='button';add.onclick=()=>{try{rememberTaste(getDoc(),{kind:kind.value,subject:'Замечание автора',detail:detail.value});detail.value=state.detail='';commit('release');draw()}catch(e){toast(e.message)}};
 box.append(kind,detail,add,list);draw();parent.append(box);
}
