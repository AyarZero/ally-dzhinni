// Встраивание модуля в существующий Production на сервере. Старый живой процесс
// продолжает отдавать совместимый HTML до штатного перезапуска; второго приложения нет.
function replaceOnce(source,anchor,replacement){if(source.split(anchor).length!==2)throw Error('Структура страницы Производства изменилась: модуль подготовки требует сверки.');return source.replace(anchor,replacement)}
export function productionMethodPage(html){
 html=replaceOnce(html,'<link rel="stylesheet" href="/production-projects.css">','<link rel="stylesheet" href="/production-projects.css"><link rel="stylesheet" href="/production-method.css">');
 html=replaceOnce(html,'import {setupProductionEditor} from "/production-editor-ui.js";','import {setupProductionEditor} from "/production-editor-ui.js";\nimport {setupProductionMethod} from "/production-method-ui.js";\nimport {validMethod} from "/production-method.js";\nimport {setupProductionWorkshop} from "/production-workshop-ui.js";\nimport {validWorkshop} from "/production-workshop.js";');
 html=replaceOnce(html,"d.parts.length>100)return false;","d.parts.length>100||!validMethod(d.method)||!validWorkshop(d.workshop))return false;");
 const setup='const productionMethod=setupProductionMethod({getDoc:doc,meta:()=>({unit:productionBoot.unit.id,title:productionBoot.unit.title}),save:changed,flush:flushProduction,revision:()=>serverRevision,fetchJSON:productionFetch,toast,openPart,setStage,makePart:part});const renderBeforeMethod=render;render=function(){renderBeforeMethod();productionMethod.refresh()};productionMethod.update();';
 html=replaceOnce(html,'<link rel="stylesheet" href="/production-method.css">','<link rel="stylesheet" href="/production-method.css"><link rel="stylesheet" href="/production-workshop.css">');
 const studio='const productionWorkshop=setupProductionWorkshop({getDoc:doc,meta:()=>({unit:productionBoot.unit.id,title:productionBoot.unit.title}),save:changed,flush:flushProduction,fetchJSON:productionFetch,toast,makePart:part});const renderBeforeWorkshop=render;render=function(){renderBeforeWorkshop();productionWorkshop.refresh()};';
 return replaceOnce(html,'</script></html>',setup+'\n'+studio+'\n</script></html>');
}
