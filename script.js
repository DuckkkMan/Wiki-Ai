(() => {
"use strict";
const FIREBASE_CONFIG={apiKey:"AIzaSyDWXHKp3KwIxbS0QMd5Qksx8pFzzYv7bQY",authDomain:"wiki-ai-4b113.firebaseapp.com",projectId:"wiki-ai-4b113",appId:"1:3569442451:web:49408883af6c7b350e3766"};
const $=s=>document.querySelector(s), sidebar=$("#sidebar"), chatArea=$("#chatArea"), welcome=$("#welcome"), messages=$("#messages"), input=$("#messageInput"), form=$("#chatForm"), send=$("#sendButton"), historyEl=$("#history"), toastBox=$("#toastRegion");
const KEY="wiki-ai-chats-v3",OWNER_KEY="wiki-ai-chats-owner-v1",GUEST_KEY="wiki-ai-chats-guest-v1",THEME="wiki-ai-theme-v3",LIMIT_KEY="wiki-ai-word-limit-v1",TEXT_KEY="wiki-ai-text-size-v1",ENTER_KEY="wiki-ai-enter-send-v1",ANIM_KEY="wiki-ai-animations-v1";let chats=read(KEY,[]),active=null,busy=false,auth=null,db=null,user=null,cloudReady=false,cloudUid=null,cloudQueue=Promise.resolve(),authGeneration=0,requestId=0,requestController=null,typingTimer=null,activeLoadingRow=null,activeResponseRow=null,activeResponseItem=null;
function setBusy(value){busy=value;send.textContent=value?"■":"↑";send.setAttribute("aria-label",value?"Parar resposta":"Enviar");send.title=value?"Parar resposta":"Enviar"}function stopResponse(){if(!busy)return;requestId++;if(requestController){requestController.abort();requestController=null}if(typingTimer){clearTimeout(typingTimer);typingTimer=null}if(activeLoadingRow){activeLoadingRow.remove();activeLoadingRow=null}if(activeResponseItem){const chat=chats.find(c=>c.id===active);if(chat){chat.items=chat.items.filter(item=>item!==activeResponseItem);const partial=activeResponseRow?.querySelector(".message-text")?.textContent||"";if(partial.trim())chat.items.push({role:"assistant",text:partial,source:null});save()}activeResponseItem=null;activeResponseRow=null}setBusy(false);input.focus()}function cancelPending(){requestId++;if(requestController){requestController.abort();requestController=null}if(typingTimer){clearTimeout(typingTimer);typingTimer=null}if(activeLoadingRow){activeLoadingRow.remove();activeLoadingRow=null}setBusy(false)}
function read(k,f){try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}}
function writeLocal(){try{localStorage.setItem(KEY,JSON.stringify(chats));if(user?.uid){localStorage.setItem("wiki-ai-chats-user-"+user.uid,JSON.stringify(chats));localStorage.setItem(OWNER_KEY,user.uid)}else{localStorage.removeItem(OWNER_KEY)}}catch{toast("Não foi possível salvar o histórico.",true)}}
function queueCloud(task){if(!db||!cloudReady||!cloudUid)return;const uid=cloudUid;cloudQueue=cloudQueue.then(async()=>{if(!db||!cloudReady||cloudUid!==uid)return;await task(db.collection("users").doc(uid).collection("chats"))}).catch(error=>{console.error("Firestore:",error);toast("Não foi possível sincronizar o histórico com a nuvem.",true)})}
function syncCloudChats(){if(!db||!cloudReady||!cloudUid)return;const snapshot=chats.map(chat=>({...chat}));queueCloud(async collection=>{for(const chat of snapshot){if(cloudUid!==user?.uid)return;await collection.doc(String(chat.id)).set({id:String(chat.id),title:String(chat.title||"Conversa"),items:Array.isArray(chat.items)?chat.items:[],time:Number(chat.time)||Date.now()})}})}
function deleteCloudChat(id){queueCloud(collection=>collection.doc(String(id)).delete())}
function clearCloudChats(){queueCloud(async collection=>{const docs=await collection.get();let batch=db.batch();let count=0;for(const doc of docs.docs){batch.delete(doc.ref);count++;if(count===450){await batch.commit();batch=db.batch();count=0}}if(count)await batch.commit()})}
function save(){writeLocal();syncCloudChats()}
function toast(t,err=false){const e=document.createElement("div");e.className="toast"+(err?" error":"");e.textContent=t;toastBox.append(e);setTimeout(()=>e.remove(),4000)}
function showChat(){welcome.hidden=true;messages.style.display="flex"}function newChat(){cancelPending();active=null;messages.replaceChildren();messages.style.display="none";welcome.hidden=false;input.value="";resize();input.focus();sidebar.classList.remove("open")}
function resize(){input.style.height="auto";input.style.height=Math.min(input.scrollHeight,180)+"px"}function scroll(){requestAnimationFrame(()=>chatArea.scrollTop=chatArea.scrollHeight)}
function getWordLimit(){const raw=read(LIMIT_KEY,600);if(raw==="infinite")return Infinity;const value=Number(raw);if(!Number.isFinite(value)||value<=0)return 600;return value>10000?Infinity:Math.floor(value)}function limitResponse(text){const marker="[[ARTICLE_TRUNCATED]]";const existing=text.includes(marker);const clean=existing?text.slice(0,text.indexOf(marker)).trimEnd():text;const originalWarning=existing?text.slice(text.indexOf(marker)+marker.length).trim():"";const words=[...clean.matchAll(/\S+/g)];const limit=getWordLimit();if(limit===Infinity||words.length<=limit)return existing?clean+"\n\n"+marker+originalWarning:clean;const cut=clean.slice(0,words[limit-1].index+words[limit-1][0].length).trimEnd();return cut+"\n\n"+marker+"Resposta limitada a "+limit+" palavras. Você pode ajustar esse limite nas configurações.";}function render(role,text,source=null,animate=false,onComplete=null){const row=document.createElement("article");row.className="message "+role;if(read(ANIM_KEY,"true")==="false")row.style.animation="none";const av=document.createElement("div");av.className="message-avatar";av.textContent=role==="user"?(user?.displayName?.[0]?.toUpperCase()||"V"):"✳";const body=document.createElement("div");body.className="message-body";const label=document.createElement("div");label.className="message-role";label.textContent=role==="user"?(user?.displayName||"Você"):"Wiki AI";const content=document.createElement("div");content.className="message-text";content.style.fontSize=(read(TEXT_KEY,"14")||"14")+"px";const cutMarker="[[ARTICLE_TRUNCATED]]";const cutAt=text.indexOf(cutMarker);const mainText=cutAt>=0?text.slice(0,cutAt):text;const warning=cutAt>=0?text.slice(cutAt+cutMarker.length).trim():"";const showWarning=()=>{if(!warning)return;const note=document.createElement("div");note.className="truncated-warning";note.textContent=warning;content.append(note)};if(!animate){content.textContent=mainText;showWarning();if(onComplete)onComplete()}body.append(label,content);const sources=Array.isArray(source)?source:(source?[source]:[]);for(const item of sources){if(!item?.url)continue;const a=document.createElement("a");a.className="source-link";a.href=item.url;a.target="_blank";a.rel="noopener noreferrer";a.textContent="↗ "+item.title;body.append(a)}row.append(av,body);messages.append(row);if(animate){let i=0;const step=()=>{if(!row.isConnected){if(typingTimer){clearTimeout(typingTimer);typingTimer=null}return}content.textContent+=mainText.slice(i,i+18);i+=18;scroll();if(i<mainText.length)typingTimer=setTimeout(step,12);else{typingTimer=null;showWarning();scroll();if(onComplete)onComplete()}};step()}scroll();return row}
function renderHistory(){historyEl.replaceChildren();if(!chats.length){const p=document.createElement("p");p.className="history-empty";p.textContent="Suas conversas aparecerão aqui.";historyEl.append(p);return}chats.sort((a,b)=>b.time-a.time).forEach(c=>{const row=document.createElement("div");row.className="history-row"+(c.id===active?" active":"");const b=document.createElement("button");b.className="history-item";b.textContent="◷  "+c.title;b.title=c.title;b.onclick=()=>openChat(c.id);const d=document.createElement("button");d.className="delete-chat";d.textContent="×";d.title="Excluir";d.onclick=()=>{chats=chats.filter(x=>x.id!==c.id);deleteCloudChat(c.id);save();renderHistory();if(active===c.id)newChat()};row.append(b,d);historyEl.append(row)})}
function openChat(id){const c=chats.find(x=>x.id===id);if(!c)return;cancelPending();active=id;messages.replaceChildren();showChat();c.items.forEach(m=>render(m.role,m.text,m.source));renderHistory();sidebar.classList.remove("open")}
function add(role,text,source){let c=chats.find(x=>x.id===active);if(!c){c={id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),title:text.slice(0,42),items:[],time:Date.now()};chats.unshift(c);active=c.id}const item={role,text,source};c.items.push(item);c.time=Date.now();if(role==="user"&&c.items.length===1)c.title=text.slice(0,42);chats=chats.slice(0,50);save();renderHistory();return item}
function typing(){const row=render("assistant","");const t=row.querySelector(".message-text"),dots=document.createElement("div");dots.className="typing";for(let i=0;i<3;i++)dots.append(document.createElement("span"));t.append(dots);return row}
function norm(s){return s.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^\p{L}\p{N}\s]/gu," ").replace(/\s+/g," ").trim()}
function smallTalk(raw){const q=norm(raw);if(/^(oi|ola|opa|eai|e ae|iae|hey|hello|bom dia|boa tarde|boa noite|salve|fala|tudo bem|como vai)(\s|$)/.test(q))return ["Oi! 😊 Como você está? Pode conversar comigo normalmente ou perguntar algo que esteja curioso para saber.","Olá! Que bom ter você por aqui. O que você gostaria de fazer hoje?","Opa! Tudo certo por aqui. Pode mandar sua pergunta ou só bater papo mesmo!"][Math.floor(Math.random()*3)];if(/^(obrigado|obrigada|valeu|brigado|brigada|thanks)(\s|$)/.test(q))return"Por nada! 😊 Se precisar de mais alguma coisa, é só falar.";if(/^(tchau|ate mais|falou|fui)$/.test(q))return"Até mais! 👋 Quando quiser conversar ou descobrir algo novo, estarei por aqui.";if(/^(quem e voce|qual seu nome|o que e voce|voce e uma ia|quem te criou)$/.test(q))return"Eu sou a Wiki AI, um chatbot experimental. Consigo conversar sobre mensagens simples e pesquisar artigos da Wikipédia. Ainda não tenho um modelo generativo completo conectado, então tenho algumas limitações.";if(/^(tudo bem|como voce esta|como vai voce)$/.test(q))return"Tudo bem por aqui! 😊 E com você?";if(/^(kkkk+|haha+|rsrs+|lol)$/.test(q))return"😂 Hahaha! Conta aí!";if(/^(sim|nao|talvez|entendi|ata|ah|ok|okay|beleza|legal|massa|show)$/.test(q))return"Entendi! 🙂 Quer me contar mais ou tem outra coisa em mente?";if(/^(me ajuda|pode me ajudar|preciso de ajuda)$/.test(q))return"Claro! Me conta com o que você precisa de ajuda e vamos por partes.";if(/^(me conte uma curiosidade|curiosidade interessante)$/.test(q))return"Uma curiosidade: polvos têm três corações, e parte do sangue deles é azul por causa de uma proteína que transporta oxigênio.";return null}
function extractTopic(raw){let q=norm(raw);q=q.replace(/^(por favor\s+)?(me diga|me explica|me explique|explique|defina|pesquise|pesquisa|procure|busque|me fale sobre|me conta sobre|fale sobre|conta sobre|o que e|oque e|o que eh|oque eh|quem e|quem foi|quem sao|como funciona|como e|qual e|quais sao|onde fica|quando foi|significado de|historia de|para que serve|me fale|me conte)\s+/,"");q=q.replace(/^(um|uma|o|a|os|as)\s+/,"");const stop=new Set(["um","uma","o","a","os","as","de","do","da","dos","das","e","em","no","na","nos","nas","por","para","com","que","qual","quais","foi","sao","ser","sobre","como","quando","onde","porque","pq","me","se","tem","mais","parte","util","wikipedia","artigo"]);return q.split(" ").filter(w=>w&&!stop.has(w)).join(" ").trim()||q}
function shouldSearch(raw){const q=norm(raw);return /^(o que|oque|quem|como|por que|porque|qual|quais|onde|quando|me fale|me conta|fale sobre|conta sobre|explique|defina|pesquise|pesquisa|procure|busque|significado de|para que serve|historia de|me explique|me diga)\b/.test(q)||/\b(wikipedia|artigo sobre|pesquise sobre|pesquisa sobre|me fale sobre|me conta sobre)\b/.test(q)}
async function wiki(query,signal){
 const base="https://pt.wikipedia.org/w/api.php";
 const clean=norm(query);
 if(!clean)return null;
 const words=clean.split(" ").filter(w=>w.length>2);
 const searchParams=new URLSearchParams({action:"query",list:"search",srsearch:query,srlimit:"10",format:"json",origin:"*",utf8:"1"});
 const res=await fetch(base+"?"+searchParams,{signal});
 if(!res.ok)throw Error("A Wikipédia não respondeu agora.");
 const data=await res.json();
 const hits=data?.query?.search||[];
 if(!hits.length)return null;
 const ranked=hits.map(hit=>{
  const titleWords=new Set(norm(hit.title).split(" "));
  const matched=words.filter(word=>titleWords.has(word)).length;
  const score=words.length?matched/words.length:0;
  return {...hit,score};
 }).filter(hit=>hit.score>=(words.length<=2?1:0.6)).sort((a,b)=>b.score-a.score);
 if(!ranked.length)return null;
 for(const hit of ranked.slice(0,3)){
  const params=new URLSearchParams({action:"query",prop:"extracts",explaintext:"1",redirects:"1",titles:hit.title,format:"json",origin:"*",utf8:"1"});
  const response=await fetch(base+"?"+params,{signal});
  if(!response.ok)continue;
  const payload=await response.json();
  const page=Object.values(payload?.query?.pages||{})[0];
  const articleText=String(page?.extract||"").replace(/\n{3,}/g,"\n\n").trim();
  if(articleText){
   const words=[...articleText.matchAll(/\S+/g)];
   const truncated=words.length>600;
   const finalText=truncated?articleText.slice(0,words[599].index+words[599][0].length).trimEnd():articleText;
   return{title:page?.title||hit.title,text:finalText+(truncated?"\n\n[[ARTICLE_TRUNCATED]]O texto foi cortado no limite de 600 palavras.":""),url:"https://pt.wikipedia.org/wiki/"+encodeURIComponent((page?.title||hit.title).replace(/ /g,"_"))};
  }
 }
 return null;
}
async function googleSearch(query,signal){
 const url="https://r.jina.ai/http://www.google.com/search?hl=pt-BR&gl=br&q="+encodeURIComponent(query);
 const res=await fetch(url,{signal,headers:{"Accept":"text/plain"}});
 if(!res.ok)throw Error("A pesquisa do Google não respondeu agora.");
 const page=await res.text();
 const lines=page.split("\n").map(x=>x.trim()).filter(Boolean);
 const results=[];
 for(let i=0;i<lines.length&&results.length<5;i++){
  const m=lines[i].match(/^\[([^\]]{3,180})\]\((https?:\/\/[^)]+)\)$/);
  if(!m||/google\.com\/search|support\.google|accounts\.google|policies\.google/i.test(m[2]))continue;
  const resultUrl=m[2].replace(/&amp;/g,"&");
  let snippet="";
  for(let j=i+1;j<Math.min(i+5,lines.length);j++){
   const line=lines[j].replace(/\*\*/g,"").trim();
   if(line&&!line.startsWith("[")&&!line.startsWith("http")&&line.length>35){snippet=line.slice(0,500);break;}
  }
  if(!results.some(x=>x.url===resultUrl))results.push({title:m[1],url:resultUrl,snippet});
 }
 return results;
}
const SEARCH_MODE_KEY="wiki-ai-search-mode-v1";
function getSearchMode(){const mode=localStorage.getItem(SEARCH_MODE_KEY);return ["auto","wiki","google","local"].includes(mode)?mode:"auto"}
function formatNumber(value){if(!Number.isFinite(value))return null;return new Intl.NumberFormat("pt-BR",{maximumFractionDigits:10}).format(Object.is(value,-0)?0:value)}
function calculate(raw){
 let q=raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/,/g,".").trim();
 q=q.replace(/^(quanto e|quanto da|calcule|calcular|resolva|resolve|resultado de|qual o resultado de|faca|faz)\s+/,"").replace(/\s+(por favor|pra mim)$/,"").trim();
 if(!q||!/[+*/^%]|\d\s*-\s*\d/.test(q)||!/^[\d\s()+\-*/^%.]+$/.test(q))return null;
 const tokens=q.match(/\d+(?:\.\d+)?|[()+\-*/^%]/g);if(!tokens||tokens.join("")!==q.replace(/\s/g,""))return null;
 let pos=0;const peek=()=>tokens[pos],take=()=>tokens[pos++];
 function primary(){if(peek()==="+"){take();return primary()}if(peek()==="-"){take();return -primary()}if(peek()==="("){take();const v=expression();if(take()!==")")throw Error("Parênteses");return v}const t=take();if(!t||!/^\d+(?:\.\d+)?$/.test(t))throw Error("Número");return Number(t)}
 function power(){let v=primary();if(peek()==="^"){take();v=Math.pow(v,power())}if(peek()==="%"){take();v/=100}return v}
 function term(){let v=power();while(peek()==="*"||peek()==="/"){const op=take(),n=power();v=op==="*"?v*n:v/n}return v}
 function expression(){let v=term();while(peek()==="+"||peek()==="-"){const op=take(),n=term();v=op==="+"?v+n:v-n}return v}
 try{const value=expression();if(pos!==tokens.length||!Number.isFinite(value))return "Essa conta não tem um resultado válido (talvez haja divisão por zero).";return "Vamos calcular!\n\n"+q.replace(/\*/g," × ").replace(/\//g," ÷ ").replace(/\^/g," ^ ")+" = **"+formatNumber(value)+"**"}catch{return null}
}
function localAnswer(raw){
 const q=norm(raw),greeting=smallTalk(raw);if(greeting)return greeting;
 const math=calculate(raw);if(math)return math;
 if(/^(que dia e hoje|qual a data de hoje|data de hoje)$/.test(q))return "Hoje é "+new Intl.DateTimeFormat("pt-BR",{dateStyle:"full"}).format(new Date())+".";
 if(/^(que horas sao|que horas e|horario atual)$/.test(q))return "Agora são "+new Intl.DateTimeFormat("pt-BR",{hour:"2-digit",minute:"2-digit"}).format(new Date())+".";
 if(/^(o que voce sabe fazer|o que voce pode fazer|como posso usar voce|ajuda|comandos)$/.test(q))return "Posso ajudar de algumas formas:\n\n• Resolver contas e expressões matemáticas.\n• Conversar e responder mensagens simples sem pesquisar.\n• Pesquisar artigos na Wikipédia.\n• Pesquisar resultados na web pelo Google.\n\nUse o seletor ao lado da caixa de mensagem para escolher o modo de pesquisa.";
 if(/^(qual e seu objetivo|para que voce serve)$/.test(q))return "Sou a Wiki AI! Meu objetivo é ajudar com cálculos, conversas simples e pesquisas na Wikipédia ou no Google. Escolha o modo que preferir no seletor de pesquisa.";
 if(/^(voce gosta de mim|voce e legal|voce e boa)$/.test(q))return "Que bom que está gostando da Wiki AI! 😊 Ainda estou em desenvolvimento, mas posso ajudar com cálculos e pesquisas.";
 return null;
}
async function answer(raw,signal){
 const mode=getSearchMode(),local=localAnswer(raw);if(local)return{text:local};
 const googleLink={title:"Abrir pesquisa no Google",url:"https://www.google.com/search?q="+encodeURIComponent(raw.trim())};
 const wikiLink={title:"Pesquisar na Wikipédia",url:"https://pt.wikipedia.org/w/index.php?search="+encodeURIComponent(raw.trim())};
 if(mode==="local")return{text:"Ainda não tenho uma resposta local para isso. Troque o modo para Automático, Wikipédia ou Google para pesquisar na internet."};
 const topic=shouldSearch(raw)?extractTopic(raw):raw.trim();
 if(mode==="auto"||mode==="wiki"){
  try{const article=await wiki(topic||raw.trim(),signal);if(article)return{text:article.text,source:[{title:"Abrir artigo: "+article.title,url:article.url},googleLink]}}
  catch(e){if(signal?.aborted)throw e}
  if(mode==="wiki")return{text:"Não encontrei um artigo correspondente na Wikipédia. Tente reformular a pergunta ou escolha o modo Google.",source:wikiLink};
 }
 if(mode==="auto"||mode==="google"){
  try{
   const results=await googleSearch(topic||raw.trim(),signal);
   if(results.length){const details=results.map((item,i)=>(i+1)+". "+item.title+(item.snippet?"\n"+item.snippet:"")).join("\n\n");return{text:(mode==="google"?"Pesquisei no Google.":"Não encontrei uma resposta adequada na Wikipédia, então pesquisei no Google.")+" Estes são alguns resultados encontrados:\n\n"+details+"\n\nConfira os links das fontes abaixo para consultar as páginas completas.",source:[...results,googleLink]}}
  }catch(e){if(signal?.aborted)throw e}
  return{text:"Não consegui carregar os resultados do Google agora. Você ainda pode abrir a pesquisa diretamente pelo link abaixo.",source:googleLink};
 }
 return{text:"Não consegui encontrar uma resposta para isso."};
}
async function sendMessage(raw){const text=raw.trim();if(!text||busy)return;setBusy(true);const id=++requestId;requestController=new AbortController();const signal=requestController.signal;showChat();render("user",text);add("user",text);input.value="";resize();activeLoadingRow=typing();try{const a=await answer(text,signal);if(id!==requestId||signal.aborted)return;const responseText=limitResponse(a.text);activeLoadingRow?.remove();activeLoadingRow=null;activeResponseItem=add("assistant",responseText,a.source);activeResponseRow=render("assistant",responseText,a.source,true,()=>{if(id===requestId){activeResponseItem=null;activeResponseRow=null;requestController=null;setBusy(false);input.focus()}})}catch(e){if(id!==requestId||signal.aborted)return;activeLoadingRow?.remove();activeLoadingRow=null;render("assistant","Ocorreu um erro ao processar sua mensagem.",null,false,()=>{if(id===requestId){requestController=null;setBusy(false);input.focus()}});toast(e.message||"Erro inesperado.",true)}}
function theme(t){document.body.classList.toggle("light-mode",t==="light");$("#themeButton").textContent=t==="light"?"☾":"☼";try{localStorage.setItem(THEME,t)}catch{}}
function showAuth(){$("#authModal").hidden=false;$("#logoutButton").hidden=!user;$("#googleButton").hidden=!!user;$("#guestButton").hidden=!!user;$("#authTitle").textContent=user?"Conta conectada":"Entre na Wiki AI"}
async function updateUser(u){
 const generation=++authGeneration,previousUser=user;
 if(previousUser?.uid&&previousUser.uid!==u?.uid){try{localStorage.setItem("wiki-ai-chats-user-"+previousUser.uid,JSON.stringify(chats))}catch{}}
 cloudReady=false;cloudUid=null;user=u||null;
 $("#userName").textContent=u?.displayName||"Visitante";$("#userEmail").textContent=u?.email||"Histórico neste dispositivo";$("#loginButton").textContent=u?"Minha conta":"Entrar";
 const av=$("#userAvatar");av.replaceChildren();if(u?.photoURL){const img=document.createElement("img");img.src=u.photoURL;img.alt="";av.append(img)}else av.textContent=u?.displayName?.[0]?.toUpperCase()||"W";
 $("#logoutButton").hidden=!u;$("#googleButton").hidden=!!u;$("#guestButton").hidden=!!u;$("#authNote").textContent=u?(u.email||"Você entrou com Google."):"Configure o Firebase no script.js para ativar o login.";
 if(!u){const owner=localStorage.getItem(OWNER_KEY);if(!owner){try{localStorage.setItem(GUEST_KEY,JSON.stringify(chats))}catch{}}else chats=read(GUEST_KEY,[]);active=null;messages.replaceChildren();messages.style.display="none";welcome.hidden=false;writeLocal();renderHistory();return}
 try{
  const owner=localStorage.getItem(OWNER_KEY);let localChats=[];
  if(owner===u.uid)localChats=read("wiki-ai-chats-user-"+u.uid,read(KEY,[]));
  else if(!owner){localChats=chats.slice();localStorage.setItem(GUEST_KEY,JSON.stringify(localChats))}
  else localChats=read("wiki-ai-chats-user-"+u.uid,[]);
  const snapshot=await db.collection("users").doc(u.uid).collection("chats").get();
  if(generation!==authGeneration||user?.uid!==u.uid)return;
  const merged=new Map();
  for(const doc of snapshot.docs){const data=doc.data();if(data&&data.id)merged.set(String(data.id),data)}
  for(const chat of localChats){if(!chat?.id)continue;const key=String(chat.id),remote=merged.get(key);if(!remote||(Number(chat.time)||0)>(Number(remote.time)||0))merged.set(key,chat)}
  chats=[...merged.values()].sort((a,b)=>(Number(b.time)||0)-(Number(a.time)||0)).slice(0,50);
  active=null;messages.replaceChildren();messages.style.display="none";welcome.hidden=false;
  cloudUid=u.uid;cloudReady=true;writeLocal();renderHistory();syncCloudChats();
 }catch(error){if(generation!==authGeneration)return;console.error("Falha ao carregar conversas:",error);toast("Não foi possível carregar o histórico da nuvem. Verifique a conexão.",true);chats=read("wiki-ai-chats-user-"+u.uid,[]);cloudUid=u.uid;cloudReady=true;writeLocal();renderHistory()}
}
function initAuth(){const configured=FIREBASE_CONFIG.apiKey!=="COLOQUE_SUA_FIREBASE_API_KEY"&&FIREBASE_CONFIG.projectId!=="COLOQUE_SEU_PROJETO"&&FIREBASE_CONFIG.appId!=="COLOQUE_SEU_FIREBASE_APP_ID";if(!configured){$("#googleButton").onclick=()=>toast("Login Google não configurado. Siga as instruções do README.",true);return}try{if(!firebase.apps.length)firebase.initializeApp(FIREBASE_CONFIG);auth=firebase.auth();db=firebase.firestore();auth.onAuthStateChanged(updateUser);$("#authNote").textContent="Login seguro gerenciado pelo Firebase.";$("#googleButton").onclick=async()=>{try{await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());$("#authModal").hidden=true;toast("Login com Google realizado!")}catch(e){toast(e.message||"Falha ao entrar com Google.",true)}}}catch(e){$("#authNote").textContent=e.message}}

const settingsOverlay=$("#settingsOverlay");
function openSettings(){settingsOverlay.hidden=false;document.body.classList.add("settings-open");syncSettings();showSettingsSection("appearance")}
function closeSettings(){settingsOverlay.hidden=true;document.body.classList.remove("settings-open")}
function showSettingsSection(name){document.querySelectorAll("[data-view]").forEach(v=>v.classList.toggle("active",v.dataset.view===name));document.querySelectorAll("[data-section]").forEach(b=>b.classList.toggle("active",b.dataset.section===name))}
function syncSettings(){const themeValue=read(THEME,"dark");document.querySelectorAll("[data-theme-choice]").forEach(b=>b.classList.toggle("selected",b.dataset.themeChoice===themeValue));$("#wordLimitSetting").value=getWordLimit()===Infinity?"10001":String(getWordLimit());$("#textSizeSetting").value=read(TEXT_KEY,"14");setSettingsSwitch($("#enterToSend"),read(ENTER_KEY,"true")!=="false");setSettingsSwitch($("#animationsSetting"),read(ANIM_KEY,"true")!=="false")}
function setSettingsSwitch(el,value){el.classList.toggle("enabled",value);el.setAttribute("aria-checked",String(value))}
$("#settingsButton").onclick=openSettings;$("#closeSettings").onclick=closeSettings;settingsOverlay.addEventListener("click",e=>{if(e.target===settingsOverlay)closeSettings()});document.querySelectorAll("[data-section]").forEach(b=>b.onclick=()=>showSettingsSection(b.dataset.section));document.querySelectorAll("[data-theme-choice]").forEach(b=>b.onclick=()=>{theme(b.dataset.themeChoice);syncSettings();toast("Tema atualizado.")});$("#wordLimitSetting").onchange=e=>{const value=Math.max(1,Math.floor(Number(e.target.value)||600));localStorage.setItem(LIMIT_KEY,String(value>10000?"infinite":value));e.target.value=String(value>10000?10001:value);toast(value>10000?"Limite de palavras: infinito.":"Limite de resposta: "+value+" palavras.")};$("#textSizeSetting").onchange=e=>{localStorage.setItem(TEXT_KEY,e.target.value);toast("Tamanho do texto atualizado.")};$("#enterToSend").onclick=()=>{const value=$("#enterToSend").getAttribute("aria-checked")!=="true";setSettingsSwitch($("#enterToSend"),value);localStorage.setItem(ENTER_KEY,String(value));toast("Preferência de envio atualizada.")};$("#animationsSetting").onclick=()=>{const value=$("#animationsSetting").getAttribute("aria-checked")!=="true";setSettingsSwitch($("#animationsSetting"),value);localStorage.setItem(ANIM_KEY,String(value));toast("Animações atualizadas.")};$("#exportChats").onclick=()=>{if(!chats.length)return toast("Não há conversas para exportar.");const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),chats},null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="wiki-ai-conversas.json";a.click();URL.revokeObjectURL(url);toast("Histórico exportado.")};$("#clearChats").onclick=()=>{if(!confirm("Apagar todas as conversas salvas neste dispositivo? Essa ação não pode ser desfeita."))return;chats=[];active=null;clearCloudChats();save();renderHistory();messages.replaceChildren();messages.style.display="none";welcome.hidden=false;toast("Histórico apagado.")};$("#resetSettings").onclick=()=>{if(!confirm("Restaurar as configurações padrão? Seu histórico não será apagado."))return;[THEME,LIMIT_KEY,TEXT_KEY,ENTER_KEY,ANIM_KEY,SEARCH_MODE_KEY].forEach(k=>localStorage.removeItem(k));theme("dark");searchModeSelect.value="auto";syncSettings();toast("Configurações restauradas.")};

const searchModeSelect=$("#searchMode");searchModeSelect.value=getSearchMode();searchModeSelect.onchange=()=>{localStorage.setItem(SEARCH_MODE_KEY,searchModeSelect.value);toast("Modo de pesquisa: "+searchModeSelect.options[searchModeSelect.selectedIndex].text)};
form.onsubmit=e=>{e.preventDefault();if(busy)stopResponse();else sendMessage(input.value)};input.addEventListener("input",resize);input.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey&&read(ENTER_KEY,"true")!=="false"){e.preventDefault();form.requestSubmit()}});document.querySelectorAll("[data-prompt]").forEach(b=>b.onclick=()=>sendMessage(b.dataset.prompt));$("#newChat").onclick=newChat;$("#themeButton").onclick=()=>theme(document.body.classList.contains("light-mode")?"dark":"light");$("#mobileMenu").onclick=()=>sidebar.classList.toggle("open");$("#closeSidebar").onclick=()=>sidebar.classList.remove("open");$("#loginButton").onclick=showAuth;$("#accountMenu").onclick=showAuth;$("#closeAuth").onclick=()=>$("#authModal").hidden=true;$("#guestButton").onclick=()=>$("#authModal").hidden=true;$("#logoutButton").onclick=async()=>{try{if(auth)await auth.signOut();updateUser(null);$("#authModal").hidden=true;toast("Você saiu da conta.")}catch(e){toast(e.message,true)}};$("#authModal").onclick=e=>{if(e.target.id==="authModal")e.currentTarget.hidden=true};document.addEventListener("keydown",e=>{if(e.key==="Escape"){sidebar.classList.remove("open");$("#authModal").hidden=true;closeSettings()}});theme(read(THEME,"dark"));renderHistory();initAuth();
})();