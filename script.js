(() => {
"use strict";
const FIREBASE_CONFIG={apiKey:"AIzaSyDWXHKp3KwIxbS0QMd5Qksx8pFzzYv7bQY",authDomain:"wiki-ai-4b113.firebaseapp.com",projectId:"wiki-ai-4b113",appId:"1:3569442451:web:49408883af6c7b350e3766"};
const $=s=>document.querySelector(s), sidebar=$("#sidebar"), chatArea=$("#chatArea"), welcome=$("#welcome"), messages=$("#messages"), input=$("#messageInput"), form=$("#chatForm"), send=$("#sendButton"), historyEl=$("#history"), toastBox=$("#toastRegion");
const LANG_KEY="wiki-ai-language-v1",ACCENT_KEY="wiki-ai-accent-v1";const KEY="wiki-ai-chats-v3",OWNER_KEY="wiki-ai-chats-owner-v1",GUEST_KEY="wiki-ai-chats-guest-v1",THEME="wiki-ai-theme-v3",LIMIT_KEY="wiki-ai-word-limit-v1",TEXT_KEY="wiki-ai-text-size-v1",ENTER_KEY="wiki-ai-enter-send-v1",ANIM_KEY="wiki-ai-animations-v1";let chats=read(KEY,[]),active=null,busy=false,auth=null,db=null,user=null,cloudReady=false,cloudUid=null,cloudQueue=Promise.resolve(),authGeneration=0,requestId=0,requestController=null,typingTimer=null,activeLoadingRow=null,activeResponseRow=null,activeResponseItem=null,geminiApiKey="",selectedImage=null;
function setBusy(value){busy=value;send.textContent=value?"■":"↑";send.setAttribute("aria-label",value?"Parar resposta":"Enviar");send.title=value?"Parar resposta":"Enviar"}function stopResponse(){if(!busy)return;requestId++;if(requestController){requestController.abort();requestController=null}if(typingTimer){clearTimeout(typingTimer);typingTimer=null}if(activeLoadingRow){activeLoadingRow.remove();activeLoadingRow=null}if(activeResponseItem){const chat=chats.find(c=>c.id===active);if(chat){chat.items=chat.items.filter(item=>item!==activeResponseItem);const partial=activeResponseRow?.querySelector(".message-text")?.textContent||"";if(partial.trim())chat.items.push({role:"assistant",text:partial,source:null});save()}activeResponseItem=null;activeResponseRow=null}setBusy(false);input.focus()}function cancelPending(){requestId++;if(requestController){requestController.abort();requestController=null}if(typingTimer){clearTimeout(typingTimer);typingTimer=null}if(activeLoadingRow){activeLoadingRow.remove();activeLoadingRow=null}setBusy(false)}
function read(k,f){try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}}
function writeLocal(){try{localStorage.setItem(KEY,JSON.stringify(chats));if(user?.uid){localStorage.setItem("wiki-ai-chats-user-"+user.uid,JSON.stringify(chats));localStorage.setItem(OWNER_KEY,user.uid)}else{localStorage.removeItem(OWNER_KEY)}}catch{toast("Não foi possível salvar o histórico.",true)}}
function queueCloud(task){if(!db||!cloudReady||!cloudUid)return;const uid=cloudUid;cloudQueue=cloudQueue.then(async()=>{if(!db||!cloudReady||cloudUid!==uid)return;await task(db.collection("users").doc(uid).collection("chats"))}).catch(error=>{console.warn("Cloud sync failed; local data remains saved.",error);toast(getLanguage()==="en"?"Cloud sync failed. Changes remain saved on this device.":"Falha ao sincronizar com a nuvem. As alterações continuam salvas neste dispositivo.",true)})}
function syncCloudChats(){if(!db||!cloudReady||!cloudUid)return;const snapshot=chats.map(chat=>({...chat}));queueCloud(async collection=>{for(const chat of snapshot){if(cloudUid!==user?.uid)return;await collection.doc(String(chat.id)).set({id:String(chat.id),title:String(chat.title||"Conversa"),items:Array.isArray(chat.items)?chat.items:[],time:Number(chat.time)||Date.now()})}})}
function preferenceSnapshot(){return{language:getLanguage(),accent:read(ACCENT_KEY,"#8b7cf6"),theme:read(THEME,"dark"),textSize:read(TEXT_KEY,"14"),wordLimit:localStorage.getItem(LIMIT_KEY)||"1000",customWordLimit:localStorage.getItem(CUSTOM_LIMIT_KEY)||"1000",enterToSend:read(ENTER_KEY,"true"),animations:read(ANIM_KEY,"true"),searchMode:getSearchMode(),imageMode:localStorage.getItem(IMAGE_MODE_KEY)==="true",customQA:getCustomQA()}}
function syncCloudPreferences(){if(!db||!cloudReady||!cloudUid)return;const uid=cloudUid,data=preferenceSnapshot();queueCloud(async collection=>{if(cloudUid!==uid)return;await collection.doc("__preferences__").set({id:"__preferences__",preferences:data,updatedAt:Date.now()})})}
function applyCloudPreferences(data){if(!data)return;const pairs=[[LANG_KEY,data.language],[ACCENT_KEY,data.accent],[THEME,data.theme],[TEXT_KEY,data.textSize],[LIMIT_KEY,data.wordLimit],[CUSTOM_LIMIT_KEY,data.customWordLimit],[ENTER_KEY,data.enterToSend],[ANIM_KEY,data.animations],[SEARCH_MODE_KEY,data.searchMode],[IMAGE_MODE_KEY,data.imageMode?"true":"false"]];for(const [key,value] of pairs)if(value!==undefined&&value!==null)localStorage.setItem(key,String(value));if(Array.isArray(data.customQA))localStorage.setItem(CUSTOM_QA_KEY,JSON.stringify(data.customQA));theme(read(THEME,"dark"));applyAccentColor(read(ACCENT_KEY,"#8b7cf6"));applyLanguage();syncSettings();updateImageToggle()}
function deleteCloudChat(id){queueCloud(collection=>collection.doc(String(id)).delete())}
function clearCloudChats(){queueCloud(async collection=>{const docs=await collection.get();let batch=db.batch();let count=0;for(const doc of docs.docs){batch.delete(doc.ref);count++;if(count===450){await batch.commit();batch=db.batch();count=0}}if(count)await batch.commit()})}
function save(){writeLocal();syncCloudChats()}
function toast(t,err=false){if(err){console.warn("Wiki AI notice:",t);return}const e=document.createElement("div");e.className="toast";e.textContent=t;toastBox.append(e);setTimeout(()=>e.remove(),3000)}
function showChat(){welcome.hidden=true;messages.style.display="flex"}function newChat(){cancelPending();active=null;messages.replaceChildren();messages.style.display="none";welcome.hidden=false;input.value="";resize();input.focus();sidebar.classList.remove("open")}
function resize(){input.style.height="auto";input.style.height=Math.min(input.scrollHeight,180)+"px"}function scroll(){requestAnimationFrame(()=>chatArea.scrollTop=chatArea.scrollHeight)}
function getWordLimit(){const c=localStorage.getItem(LIMIT_KEY)||"1000";if(c==="unlimited")return Infinity;const n=Number(c);return Number.isFinite(n)&&n>=100&&n<=5000?Math.round(n/100)*100:1000}function limitResponse(text){const marker="[[ARTICLE_TRUNCATED]]";const existing=text.includes(marker);const clean=existing?text.slice(0,text.indexOf(marker)).trimEnd():text;const words=[...clean.matchAll(/\S+/g)];const limit=getWordLimit();if(words.length<=limit)return existing?clean+"\n\n"+marker+(getLanguage()==="en"?"The article was shortened. Open the full article for more.":"O texto foi cortado e é recomendável ver o artigo completo."):clean;const cut=clean.slice(0,words[limit-1].index+words[limit-1][0].length).trimEnd();return cut+"\n\n"+marker+(getLanguage()==="en"?"The response reached your selected word limit.":"A resposta atingiu o limite de palavras escolhido.");}function render(role,text,source=null,animate=false,onComplete=null){
 const row=document.createElement("article");row.className="message "+role;
 if(read(ANIM_KEY,"true")==="false")row.style.animation="none";
 const av=document.createElement("div");av.className="message-avatar";av.textContent=role==="user"?(user?.displayName?.[0]?.toUpperCase()||"V"):"✳";
 const body=document.createElement("div");body.className="message-body";
 const label=document.createElement("div");label.className="message-role";label.textContent=role==="user"?(user?.displayName||(getLanguage()==="en"?"You":"Você")):"Wiki AI";
 const sources=Array.isArray(source)?source:(source?[source]:[]);
 const content=document.createElement("div");content.className="message-text";content.style.fontSize=(read(TEXT_KEY,"14")||"14")+"px";
 const cutMarker="[[ARTICLE_TRUNCATED]]";const cutAt=text.indexOf(cutMarker);const mainText=cutAt>=0?text.slice(0,cutAt):text;const warning=cutAt>=0?text.slice(cutAt+cutMarker.length).trim():"";
 const showWarning=()=>{if(!warning)return;const note=document.createElement("div");note.className="truncated-warning";note.textContent=warning;content.append(note)};
 body.append(label);
 for(const item of sources){if(item?.image){const image=document.createElement("img");image.className="wiki-result-image";image.src=item.image;image.alt=item.title||"Wikipedia image";image.loading="lazy";body.append(image)}}
 body.append(content);
 for(const item of sources){if(!item?.url)continue;const a=document.createElement("a");a.className="source-link";a.href=item.url;a.target="_blank";a.rel="noopener noreferrer";a.textContent="↗ "+item.title;body.append(a)}
 row.append(av,body);messages.append(row);
 if(!animate){content.textContent=mainText;showWarning();if(onComplete)onComplete()}
 if(animate){let i=0;const step=()=>{if(!row.isConnected){if(typingTimer){clearTimeout(typingTimer);typingTimer=null}return}content.textContent+=mainText.slice(i,i+18);i+=18;scroll();if(i<mainText.length)typingTimer=setTimeout(step,12);else{typingTimer=null;showWarning();scroll();if(onComplete)onComplete()}};step()}
 scroll();return row
}
function renderHistory(){historyEl.replaceChildren();if(!chats.length){const p=document.createElement("p");p.className="history-empty";p.textContent=getLanguage()==="en"?"Your conversations will appear here.":"Suas conversas aparecerão aqui.";historyEl.append(p);return}chats.sort((a,b)=>b.time-a.time).forEach(c=>{const row=document.createElement("div");row.className="history-row"+(c.id===active?" active":"");const b=document.createElement("button");b.className="history-item";b.textContent="◷  "+c.title;b.title=c.title;b.onclick=()=>openChat(c.id);const d=document.createElement("button");d.className="delete-chat";d.textContent="×";d.title="Excluir";d.onclick=()=>{chats=chats.filter(x=>x.id!==c.id);deleteCloudChat(c.id);save();renderHistory();if(active===c.id)newChat()};row.append(b,d);historyEl.append(row)})}
function openChat(id){const c=chats.find(x=>x.id===id);if(!c)return;cancelPending();active=id;messages.replaceChildren();showChat();c.items.forEach(m=>render(m.role,m.text,m.source));renderHistory();sidebar.classList.remove("open")}
function add(role,text,source){let c=chats.find(x=>x.id===active);if(!c){c={id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),title:text.slice(0,42),items:[],time:Date.now()};chats.unshift(c);active=c.id}const item={role,text,source};c.items.push(item);c.time=Date.now();if(role==="user"&&c.items.length===1)c.title=text.slice(0,42);chats=chats.slice(0,50);save();renderHistory();return item}
function typing(){const row=render("assistant","");const t=row.querySelector(".message-text"),dots=document.createElement("div");dots.className="typing";for(let i=0;i<3;i++)dots.append(document.createElement("span"));t.append(dots);return row}
function norm(s){return s.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^\p{L}\p{N}\s]/gu," ").replace(/\s+/g," ").trim()}
function smallTalk(raw){
 const q=norm(raw);
 if(/^(oi|ola|opa|eai|e ae|iae|hey|hello|bom dia|boa tarde|boa noite|salve|fala|tudo bem|como vai|e ai)(\s|$)/.test(q))return ["Oi! 😊 Como você está? Pode conversar comigo normalmente ou perguntar algo que esteja curioso para saber.","Olá! Que bom ter você por aqui. O que você gostaria de fazer hoje?","Opa! Tudo certo por aqui. Pode mandar sua pergunta ou só bater papo mesmo!"][Math.floor(Math.random()*3)];
 if(/^(obrigado|obrigada|valeu|brigado|brigada|thanks|muito obrigado|muito obrigada)$/.test(q))return "Por nada! 😊 Fico feliz em ajudar.";
 if(/^(tchau|ate mais|falou|fui|ate logo|ate breve)$/.test(q))return "Até mais! 👋 Tenha um ótimo dia!";
 if(/^(quem e voce|qual seu nome|como voce se chama|o que e voce|voce e uma ia|quem te criou|quem criou voce)$/.test(q))return "Eu sou a Wiki AI, um assistente experimental. Fui criado como um projeto de site para conversar, fazer cálculos e pesquisar informações na Wikipédia ou no Google.";
 if(/^(tudo bem|como voce esta|como vai voce)$/.test(q))return "Tudo bem por aqui! 😊 E você, como está?";
 if(/^(estou bem|to bem|tudo certo|tudo tranquilo|estou otimo|estou otima)$/.test(q))return "Que bom! 😊 O que vamos fazer agora?";
 if(/^(estou mal|to mal|dia ruim|nao estou bem)$/.test(q))return "Poxa, sinto muito que seu dia não esteja sendo dos melhores. Se quiser, pode me contar o que aconteceu. Também podemos conversar sobre outra coisa.";
 if(/^(kkkk+|haha+|hahaha+|rsrs+|lol)$/.test(q))return "😂 Hahaha! Conta aí!";
 if(/^(sim|nao|talvez|entendi|ata|ah|ok|okay|beleza|legal|massa|show|certo|combinado)$/.test(q))return "Entendi! 🙂 Quer me contar mais ou tem outra coisa em mente?";
 if(/^(me ajuda|pode me ajudar|preciso de ajuda|socorro)$/.test(q))return "Claro! Me conta com o que você precisa de ajuda e vamos por partes.";
 if(/^(desculpa|desculpe|foi mal|perdao)$/.test(q))return "Tudo bem! Não tem problema. 😊";
 if(/^(parabens|boa sorte|bom trabalho)$/.test(q))return "Obrigado! 😊";
 if(/^(me conte uma curiosidade|curiosidade interessante)$/.test(q))return "Uma curiosidade: polvos têm três corações, e parte do sangue deles é azul por causa de uma proteína que transporta oxigênio.";
 if(/^(conte uma piada|me conte uma piada|faz uma piada|conte uma gracinha)$/.test(q))return "Por que o livro de matemática ficou triste? Porque tinha muitos problemas! 😄";
 if(/^(e voce|e vc|e contigo)$/.test(q))return "Estou por aqui, pronto para ajudar! 😄";
 return null;
}
function extractTopic(raw){
 let q=norm(raw);
 if(getLanguage()==="en")q=q.replace(/^(please\s+)?(tell me about|what is|what are|who is|who was|who are|how does|how do|explain|define|search for|look up)\s+/,"");
 else q=q.replace(/^(por favor\s+)?(me diga|me explica|me explique|explique|defina|pesquise|pesquisa|procure|busque|me fale sobre|me conta sobre|fale sobre|conta sobre|o que e|oque e|o que eh|oque eh|quem e|quem foi|quem sao|como funciona|como e|qual e|quais sao|onde fica|quando foi|significado de|historia de|para que serve|me fale|me conte)\s+/,"");
 q=q.replace(/^(a|an|the|um|uma|o|a|os|as)\s+/,"");
 const stop=new Set(["a","an","the","of","in","on","for","about","is","are","was","were","what","who","how","when","where","why","please","tell","me","um","uma","o","os","as","de","do","da","dos","das","e","em","no","na","nos","nas","por","para","com","que","qual","quais","foi","sao","ser","sobre","como","quando","onde","porque","pq","se","tem","mais","parte","util","wikipedia","artigo"]);
 return q.split(" ").filter(w=>w&&!stop.has(w)).join(" ").trim()||q;
}
function shouldSearch(raw){
 const q=norm(raw);
 if(getLanguage()==="en")return /^(what is|what are|who is|who was|who are|how does|how do|why|which|where|when|tell me about|explain|define|search for|look up)\b/.test(q)||/\b(wikipedia|article about)\b/.test(q);
 return /^(o que|oque|quem|como|por que|porque|qual|quais|onde|quando|me fale|me conta|fale sobre|conta sobre|explique|defina|pesquise|pesquisa|procure|busque|significado de|para que serve|historia de|me explique|me diga)\b/.test(q)||/\b(wikipedia|artigo sobre|pesquise sobre|pesquisa sobre|me fale sobre|me conta sobre)\b/.test(q);
}
async function wiki(query,signal){
 const language=getLanguage(),base=language==="en"?"https://en.wikipedia.org/w/api.php":"https://pt.wikipedia.org/w/api.php";
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
 }).sort((a,b)=>b.score-a.score);
 const candidates=ranked.filter(hit=>hit.score>=(words.length<=2?0.5:0.35));
 if(!candidates.length&&ranked.length)candidates.push(ranked[0]);
 if(!candidates.length)return null;
 for(const hit of candidates.slice(0,3)){
  const params=new URLSearchParams({action:"query",prop:"extracts|pageimages",piprop:"thumbnail",pithumbsize:"720",explaintext:"1",redirects:"1",titles:hit.title,format:"json",origin:"*",utf8:"1"});
  const response=await fetch(base+"?"+params,{signal});
  if(!response.ok)continue;
  const payload=await response.json();
  const page=Object.values(payload?.query?.pages||{})[0];
  const articleText=String(page?.extract||"").replace(/\n{3,}/g,"\n\n").trim();
  if(articleText){
   const words=[...articleText.matchAll(/\S+/g)];
   const limit=getWordLimit();const truncated=words.length>limit;
   const finalText=truncated?articleText.slice(0,words[limit-1].index+words[limit-1][0].length).trimEnd():articleText;
   return{title:page?.title||hit.title,text:finalText+(truncated?"\n\n[[ARTICLE_TRUNCATED]]"+(language==="en"?"The article was shortened. Open the full article for more.":"O texto foi cortado e é recomendável ver o artigo completo."):""),image:localStorage.getItem(IMAGE_MODE_KEY)==="true"?(page?.thumbnail?.source||null):null,url:(language==="en"?"https://en.wikipedia.org/wiki/":"https://pt.wikipedia.org/wiki/")+encodeURIComponent((page?.title||hit.title).replace(/ /g,"_"))};
  }
 }
 return null;
}
const SEARCH_MODE_KEY="wiki-ai-search-mode-v1";const IMAGE_MODE_KEY="wiki-ai-image-mode-v1";const CUSTOM_LIMIT_KEY="wiki-ai-custom-word-limit-v1";
function getSearchMode(){const mode=localStorage.getItem(SEARCH_MODE_KEY);return ["wiki","local","custom","gemini"].includes(mode)?mode:"wiki"}
function getGeminiApiKey(){return geminiApiKey}
function syncGeminiSettings(){const panel=$("#geminiSettings"),input=$("#geminiApiKey"),status=$("#geminiKeyStatus");if(panel)panel.hidden=searchModeSelect.value!=="gemini";if(input)input.value="";if(status)status.textContent=getGeminiApiKey()?(getLanguage()==="en"?"A key is loaded in this page.":"Chave carregada nesta página."):(getLanguage()==="en"?"No key configured on this page.":"Nenhuma chave configurada nesta página.")}
async function answerGemini(raw,signal,image=null){
  const apiKey=getGeminiApiKey();
  if(!apiKey)throw new Error(getLanguage()==="en"?"Open Settings → Answers, select Gemini and save your Google AI Studio API key on this page.":"Abra Configurações → Respostas, selecione Gemini e salve sua chave da API do Google AI Studio nesta página.");
  const chat=chats.find(item=>item.id===active);
  const history=(chat?.items||[]).slice(-12).map(item=>(item.role==="user"?"Usuário: ":"Wiki AI: ")+String(item.text||"")).join("\n\n");
  const prompt=(getLanguage()==="en"?"You are Wiki AI, a helpful assistant. Answer clearly in the user's language. Do not claim to browse the web or cite sources.":"Você é a Wiki AI, uma assistente útil. Responda com clareza no idioma do usuário. Não diga que pesquisou na internet nem invente fontes.")+"\n\n"+(history?"Histórico recente da conversa:\n"+history+"\n\n":"")+(raw.trim()?(getLanguage()==="en"?"Latest user message: ":"Mensagem mais recente do usuário: ")+raw.trim():(getLanguage()==="en"?"The user sent an image without text. Describe it and help with what can be seen.":"O usuário enviou uma imagem sem texto. Descreva-a e ajude com base no que aparece nela."));
  const inputContent=[{type:"text",text:prompt}];
  if(image)inputContent.push({type:"image",mime_type:image.mimeType,data:image.data});
  const models=["gemini-3.1-flash-lite","gemini-3.5-flash-lite"];
  let response=null,data=null,lastError=null;
  for(const model of models){
   response=await fetch("https://generativelanguage.googleapis.com/v1beta/interactions",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":apiKey},body:JSON.stringify({model,input:inputContent,generation_config:{max_output_tokens:4096,thinking_level:"low"},store:false}),signal});
   try{data=await response.json()}catch{throw new Error(getLanguage()==="en"?"Gemini returned an unreadable response.":"O Gemini retornou uma resposta inválida.")}
   if(response.ok)break;
   lastError=data?.error?.message||("HTTP "+response.status);
   if(response.status!==503)throw new Error(lastError);
  }
  if(!response?.ok)throw new Error((getLanguage()==="en"?"Gemini models are temporarily busy. Please try again in a little while. Details: ":"Os modelos Gemini estão temporariamente ocupados. Tente novamente daqui a pouco. Detalhes: ")+(lastError||"503"));
  const sources=[],textParts=[];
  for(const step of (Array.isArray(data.steps)?data.steps:[])){if(step?.type!=="model_output")continue;for(const block of (Array.isArray(step.content)?step.content:[])){if(block?.type==="text"&&block.text)textParts.push(block.text);for(const annotation of (Array.isArray(block?.annotations)?block.annotations:[])){if(annotation?.type==="url_citation"){const url=annotation.url||annotation.uri;if(url&&/^https?:\/\//i.test(url)&&!sources.some(source=>source.url===url))sources.push({title:annotation.title||url,url})}}}}
  const output=String(data.output_text||textParts.join("\n\n")).trim();
  if(!output)throw new Error(getLanguage()==="en"?"Gemini did not return any text.":"O Gemini não retornou nenhum texto.");
  return{text:output,source:sources};
 }
function getLanguage(){return localStorage.getItem(LANG_KEY)==="en"?"en":"pt"}
function applyAccentColor(value){const color=/^#[0-9a-f]{6}$/i.test(value||"")?value:"#8b7cf6";document.documentElement.style.setProperty("--brand-accent",color);try{localStorage.setItem(ACCENT_KEY,color)}catch{}}
function applyLanguage(){
 const en=getLanguage()==="en";document.documentElement.lang=en?"en":"pt-BR";
 const set=(selector,value)=>{const el=$(selector);if(el)el.textContent=value};
 set("#newChat",en?"＋ New chat":"＋ Nova conversa");set(".history-heading",en?"Recent":"Recentes");
 set(".welcome h1",en?"What shall we explore today?":"O que vamos explorar hoje?");
 set(".welcome>p",en?"Chat with me, ask questions, or discover something new.":"Converse comigo, tire dúvidas ou descubra algo novo.");
 const prompts=en?[["Let's talk","Start with a hello"],["A fun fact","Learn something unexpected"],["Explore technology","Understand how it works"],["Create something","Ideas for your project"]]:[["Vamos conversar","Comece com um oi"],["Uma curiosidade","Aprenda algo inesperado"],["Explorar tecnologia","Entenda como funciona"],["Criar alguma coisa","Ideias para seu projeto"]];
 document.querySelectorAll(".prompt-card").forEach((card,i)=>{const strong=card.querySelector("strong"),small=card.querySelector("small");if(strong)strong.textContent=prompts[i][0];if(small)small.textContent=prompts[i][1]});
 input.placeholder=en?"Send a message to Wiki AI":"Envie uma mensagem para a Wiki AI";
 set(".disclaimer",en?"Wiki AI can make mistakes. Check important information in the sources.":"A Wiki AI pode cometer erros. Confira informações importantes nas fontes.");
 const shortcut=$("#settingsButton");if(shortcut){shortcut.title=en?"Open settings":"Abrir configurações";shortcut.setAttribute("aria-label",shortcut.title);const span=shortcut.querySelector("span:last-child");if(span)span.textContent=en?"Settings":"Configurações"}
 const nav=[["Appearance","Theme and reading"],["Answers","Limits and search"],["Experience","Interface behavior"],["Data & privacy","History and export"]];
 document.querySelectorAll(".settings-nav-item").forEach((b,i)=>{const spans=b.querySelectorAll("span");if(spans[1]){spans[1].childNodes[0].textContent=en?nav[i][0]:["Aparência","Respostas","Experiência","Dados e privacidade"][i];const sm=spans[1].querySelector("small");if(sm)sm.textContent=en?nav[i][1]:["Tema e leitura","Limites e pesquisa","Comportamento","Histórico e exportação"][i]}});
 const intro=en?[["Appearance","Customize the look of Wiki AI."],["Answers","Choose how Wiki AI presents information."],["Experience","Small details for a more comfortable experience."],["Data & privacy","You control the conversations saved here."]]:[["Aparência","Personalize o visual da sua Wiki AI."],["Respostas","Defina como a Wiki AI apresenta as informações."],["Experiência","Pequenos detalhes que deixam tudo mais confortável."],["Dados e privacidade","Você tem controle sobre suas conversas salvas."]];
 document.querySelectorAll(".settings-intro").forEach((el,i)=>{const h=el.querySelector("h3"),p=el.querySelector("p");if(h)h.textContent=intro[i][0];if(p)p.textContent=intro[i][1]});
 const pt=[
 ["Tema da interface","Escolha o estilo que fica melhor para você."],["Idioma da interface e pesquisa","Escolha Português ou English. A pesquisa usará a Wikipédia no mesmo idioma."],["Cor de destaque","Personalize a cor dos botões e detalhes da interface."],["Tamanho do texto","Ajuste a leitura das mensagens."],["Modo de resposta","Escolha entre pesquisar na Wikipédia, conversar sem pesquisa ou usar suas próprias perguntas e respostas."],["Perguntas e respostas personalizadas","Cadastre uma pergunta e a resposta exata que a Wiki AI deverá usar no modo Customizado. Se cadastrar a mesma pergunta novamente, a resposta será atualizada."],["Limite máximo de palavras","Use a barra para escolher o máximo de palavras em cada resposta."],["Enviar com Enter","Enter envia a mensagem; Shift + Enter cria uma nova linha."],["Animações da interface","Ative ou desative os movimentos e transições."],["Exportar conversas","Baixe uma cópia do seu histórico em um arquivo JSON."],["Apagar histórico","Remove todas as conversas salvas neste navegador. Essa ação não pode ser desfeita."]
 ];
 const eng=[
 ["Interface theme","Choose the look that works best for you."],["Interface language and search","Choose Portuguese or English. Search will use Wikipedia in the same language."],["Accent color","Customize the color of buttons and interface details."],["Text size","Adjust message readability."],["Answer mode","Choose Wikipedia search, offline chat, or your own question-and-answer pairs."],["Custom questions and answers","Save a question and the exact answer Wiki AI should use in Custom mode. Saving the same question again updates its answer."],["Maximum word limit","Use the slider to choose the maximum number of words in each response."],["Send with Enter","Enter sends the message; Shift + Enter creates a new line."],["Interface animations","Enable or disable movement and transitions."],["Export conversations","Download a copy of your history as a JSON file."],["Delete history","Removes all conversations saved in this browser. This cannot be undone."]
 ];
 document.querySelectorAll(".settings-option-copy").forEach((el,i)=>{const pair=(en?eng:pt)[i],strong=el.querySelector("strong"),span=el.querySelector("span");if(pair){if(strong)strong.textContent=pair[0];if(span)span.textContent=pair[1]}});
 const themeCards=document.querySelectorAll(".settings-theme-card");if(themeCards[0]){themeCards[0].querySelector("b").textContent=en?"Dark":"Escuro";themeCards[0].querySelector("small").textContent=en?"Comfortable in low-light environments":"Confortável em ambientes com pouca luz"}if(themeCards[1]){themeCards[1].querySelector("b").textContent=en?"Light":"Claro";themeCards[1].querySelector("small").textContent=en?"A bright, lightweight look":"Visual leve e iluminado"}
 const mode=$("#searchMode");if(mode){mode.options[0].text=en?"Wikipedia":"Wikipédia";mode.options[1].text=en?"Local chat":"Conversa local";mode.options[2].text=en?"Custom":"Customizado";mode.options[3].text="Gemini (Google)"}const geminiLabel=$("#geminiKeyLabel"),geminiInput=$("#geminiApiKey"),saveGemini=$("#saveGeminiKey"),clearGemini=$("#clearGeminiKey");if(geminiLabel)geminiLabel.textContent=en?"Gemini API key":"Chave da API Gemini";if(geminiInput)geminiInput.placeholder=en?"Paste your Google AI Studio key":"Cole sua chave do Google AI Studio";if(saveGemini)saveGemini.textContent=en?"Save for this tab":"Salvar nesta aba";if(clearGemini)clearGemini.textContent=en?"Remove key":"Remover chave";
 const size=$("#textSizeSetting");if(size){size.options[0].text=en?"Small":"Pequeno";size.options[1].text=en?"Default":"Padrão";size.options[2].text=en?"Large":"Grande";size.options[3].text=en?"Very large":"Muito grande"}
 const q=$("#customQuestion"),a=$("#customAnswer"),saveQA=$("#saveCustomQA");if(q)q.placeholder=en?"Your question (e.g. What is my game?)":"Sua pergunta (ex.: Qual é meu jogo?)";if(a)a.placeholder=en?"The answer Wiki AI should give...":"Resposta que a Wiki AI deve dar...";if(saveQA)saveQA.textContent=en?"＋ Save question and answer":"＋ Salvar pergunta e resposta";
 const empty=$("#customQAList")?.querySelector(".custom-qa-empty");if(empty)empty.textContent=en?"No custom questions saved yet.":"Nenhuma pergunta personalizada cadastrada.";
 updateWordLimitValue();const ib=$("#imageModeToggle");if(ib){const label=ib.querySelector("span");if(label)label.textContent=en?"Images":"Imagens";ib.title=en?"Show Wikipedia images":"Mostrar imagens da Wikipédia"}const attach=$("#attachImageButton");if(attach){attach.title=en?"Attach image":"Anexar imagem";attach.setAttribute("aria-label",attach.title);const label=attach.querySelector("span");if(label)label.textContent=en?"Image":"Imagem"}
 const exportBtn=$("#exportChats"),clearBtn=$("#clearChats"),reset=$("#resetSettings");if(exportBtn)exportBtn.textContent=en?"↓ Export":"↓ Exportar";if(clearBtn)clearBtn.textContent=en?"Delete all":"Apagar tudo";if(reset)reset.textContent=en?"Restore defaults":"Restaurar padrões";
 const footer=document.querySelector(".settings-panel-footer span");if(footer)footer.textContent=en?"Changes are saved automatically":"Alterações salvas automaticamente";
 set("#settingsTitle",en?"Settings":"Configurações");const kicker=$(".settings-kicker");if(kicker)kicker.textContent=en?"PREFERENCES":"CENTRAL DE PREFERÊNCIAS";
 const login=$("#loginButton");if(login)login.textContent=user?(en?"My account":"Minha conta"):(en?"Sign in":"Entrar");
 const authTitle=$("#authTitle");if(authTitle&&!user)authTitle.textContent=en?"Sign in to Wiki AI":"Entre na Wiki AI";
 const authSub=$(".auth-subtitle");if(authSub)authSub.textContent=en?"Sign in with Google to personalize your experience.":"Entre com Google para personalizar sua experiência.";
 const google=$("#googleButton");if(google)google.innerHTML='<span class="google-g">G</span> '+(en?"Continue with Google":"Continuar com Google");
 const guest=$("#guestButton");if(guest)guest.textContent=en?"Continue without an account":"Continuar sem conta";
 const note=$("#authNote");if(note&&!user)note.textContent=en?"Set up Firebase in script.js to enable sign-in.":"Configure o Firebase no script.js para ativar o login.";
 set("#userEmail",user?.email||(en?"History on this device":"Histórico neste dispositivo"));const userName=$("#userName");if(userName&&!user)userName.textContent=en?"Visitor":"Visitante";const prefTitle=document.querySelector(".settings-sidebar-bottom strong"),prefSub=document.querySelector(".settings-sidebar-bottom small");if(prefTitle)prefTitle.textContent=en?"Your preferences":"Suas preferências";if(prefSub)prefSub.textContent=en?"Saved on this device":"Salvas neste dispositivo";renderCustomQA();
}

const CUSTOM_QA_KEY="wiki-ai-custom-qa-v1";
function getCustomQA(){const list=read(CUSTOM_QA_KEY,[]);return Array.isArray(list)?list.filter(x=>x&&typeof x.question==="string"&&typeof x.answer==="string"):[]}
function renderCustomQA(){
 const list=$("#customQAList");if(!list)return;list.replaceChildren();
 const entries=getCustomQA();
 if(!entries.length){const empty=document.createElement("p");empty.className="custom-qa-empty";empty.textContent=getLanguage()==="en"?"No custom questions saved yet.":"Nenhuma pergunta personalizada cadastrada.";list.append(empty);return}
 entries.forEach((entry,index)=>{const row=document.createElement("article");row.className="custom-qa-item";const copy=document.createElement("div");copy.className="custom-qa-copy";const question=document.createElement("strong");question.textContent=entry.question;const answer=document.createElement("p");answer.textContent=entry.answer;copy.append(question,answer);const remove=document.createElement("button");remove.className="settings-action danger";remove.type="button";remove.textContent=getLanguage()==="en"?"Delete":"Excluir";remove.onclick=()=>{const next=getCustomQA();next.splice(index,1);localStorage.setItem(CUSTOM_QA_KEY,JSON.stringify(next));renderCustomQA();syncCloudPreferences();toast(getLanguage()==="en"?"Custom question deleted.":"Pergunta personalizada excluída.")};row.append(copy,remove);list.append(row)})
}
function findCustomAnswer(raw){const query=norm(raw);if(!query)return null;const entries=getCustomQA();const match=entries.find(entry=>norm(entry.question)===query);return match?match.answer:null}

function formatNumber(value){if(!Number.isFinite(value))return null;return new Intl.NumberFormat(getLanguage()==="en"?"en-US":"pt-BR",{maximumFractionDigits:10}).format(Object.is(value,-0)?0:value)}
function calculate(raw){
 let q=raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().replace(/[?!]+$/,"");
 q=q.replace(/^(quanto e|quanto da|calcule|calcular|resolva|resolve|resultado de|qual o resultado de|faca|faz|what is|calculate|compute|how much is)\s+/, "").replace(/\s+(por favor|pra mim|please)$/, "").trim();
 q=q.replace(/\bmais\b/g,"+").replace(/\bmenos\b/g,"-").replace(/\bvezes\b/g,"*").replace(/\b(?:dividido por|dividido|dividir por)\b/g,"/").replace(/\bplus\b/g,"+").replace(/\bminus\b/g,"-").replace(/\btimes\b/g,"*").replace(/\bdivided by\b/g,"/").replace(/\bx\b/g,"*").replace(/,/g,".");
 const percent=q.match(/^(\d+(?:\.\d+)?)\s*%\s*(?:de|do|da|of)\s*(\d+(?:\.\d+)?)$/);
 if(percent)return (getLanguage()==="en"?"Let’s calculate!\n\n":"Vamos calcular!\n\n")+percent[1]+"% "+(getLanguage()==="en"?"of ":"de ")+percent[2]+" = "+formatNumber(Number(percent[1])*Number(percent[2])/100);
 if(!q||!/^[\d\s()+\-*/^%.]+$/.test(q)||!/[+*/^%]|\d\s*-\s*\d/.test(q))return null;
 const tokens=q.match(/\d+(?:\.\d+)?|[()+\-*/^%]/g);if(!tokens||tokens.join("")!==q.replace(/\s/g,""))return null;
 let pos=0;const peek=()=>tokens[pos],take=()=>tokens[pos++];
 function primary(){if(peek()==="+"){take();return primary()}if(peek()==="-"){take();return -primary()}if(peek()==="("){take();const v=expression();if(take()!==")")throw Error("Parênteses");return v}const t=take();if(!t||!/^\d+(?:\.\d+)?$/.test(t))throw Error("Número");return Number(t)}
 function power(){let v=primary();if(peek()==="^"){take();v=Math.pow(v,power())}if(peek()==="%"){take();v/=100}return v}
 function term(){let v=power();while(peek()==="*"||peek()==="/"){const op=take(),n=power();v=op==="*"?v*n:v/n}return v}
 function expression(){let v=term();while(peek()==="+"||peek()==="-"){const op=take(),n=term();v=op==="+"?v+n:v-n}return v}
 try{const value=expression();if(pos!==tokens.length||!Number.isFinite(value))return getLanguage()==="en"?"This calculation has no valid result (there may be division by zero).":"Essa conta não tem um resultado válido (talvez haja divisão por zero).";return (getLanguage()==="en"?"Let’s calculate!\n\n":"Vamos calcular!\n\n")+q.replace(/\*/g," × ").replace(/\//g," ÷ ").replace(/\^/g," ^ ")+" = "+formatNumber(value)}catch{return null}
}
function localAnswer(raw){
 const q=norm(raw);
 if(getLanguage()==="en"){
  const math=calculate(raw);if(math)return math;
  if(/^(hi|hello|hey|good morning|good afternoon|good evening|how are you)$/.test(q))return "Hello! 😊 What would you like to explore today?";
  if(/^(thanks|thank you|thx)$/.test(q))return "You’re welcome! Happy to help.";
  if(/^(bye|goodbye|see you)$/.test(q))return "See you next time! Have a great day.";
  if(/^(what is your name|who are you)$/.test(q))return "I’m Wiki AI, an experimental assistant that can chat, calculate, and search Wikipedia.";
  if(/^(tell me a fun fact|interesting fact)$/.test(q))return "Fun fact: octopuses have three hearts, and their blood is blue because it uses a copper-containing protein to transport oxygen.";
  if(/^(what can you do|help|commands)$/.test(q))return "I can chat, solve calculations, search Wikipedia, and use custom answers you save in Settings.";
  if(/^(what day is it|what is today.s date|today.s date)$/.test(q))return "Today is "+new Intl.DateTimeFormat("en-US",{dateStyle:"full"}).format(new Date())+".";
  if(/^(what time is it|current time)$/.test(q))return "It is "+new Intl.DateTimeFormat("en-US",{hour:"2-digit",minute:"2-digit"}).format(new Date())+".";
  return null;
 }
 const greeting=smallTalk(raw);if(greeting)return greeting;
 const math=calculate(raw);if(math)return math;
 if(/^(que dia e hoje|qual a data de hoje|data de hoje)$/.test(q))return "Hoje é "+new Intl.DateTimeFormat("pt-BR",{dateStyle:"full"}).format(new Date())+".";
 if(/^(que horas sao|que horas e|horario atual)$/.test(q))return "Agora são "+new Intl.DateTimeFormat("pt-BR",{hour:"2-digit",minute:"2-digit"}).format(new Date())+".";
 if(/^(o que voce sabe fazer|o que voce pode fazer|como posso usar voce|ajuda|comandos)$/.test(q))return "Posso conversar, resolver contas, pesquisar artigos na Wikipédia e responder perguntas personalizadas que você cadastrar no modo Customizado. Escolha o modo nas Configurações → Respostas.";
 if(/^(qual e seu objetivo|para que voce serve)$/.test(q))return "Sou a Wiki AI! Posso conversar, fazer cálculos, pesquisar na Wikipédia e usar suas perguntas e respostas personalizadas.";
 if(/^(voce gosta de mim|voce e legal|voce e boa)$/.test(q))return "Que bom que está gostando da Wiki AI! 😊 Ainda estou em desenvolvimento, mas posso ajudar com cálculos e pesquisas.";
 return null;
}
async function answer(raw,signal){
 const mode=getSearchMode();
 if(mode==="gemini")return await answerGemini(raw,signal);
 if(mode==="custom"){
  const custom=findCustomAnswer(raw);if(custom)return{text:custom};
  const local=localAnswer(raw);if(local)return{text:local};
  return{text:getLanguage()==="en"?"I don’t have an answer for that yet. Add this question and its answer in Settings → Answers → Custom mode.":"Ainda não tenho uma resposta para essa pergunta. Cadastre essa pergunta e a resposta desejada em Configurações → Respostas → Modo Customizado."};
 }
 const local=localAnswer(raw);if(local)return{text:local};
 if(mode==="local")return{text:getLanguage()==="en"?"I don’t have a local answer for that yet. Add an answer in Custom mode or switch to Wikipedia in Settings.":"Ainda não tenho uma resposta local para isso. Você pode cadastrar uma resposta no modo Customizado ou mudar para Wikipédia nas configurações."};
 const topic=shouldSearch(raw)?extractTopic(raw):raw.trim();
 try{const article=await wiki(topic||raw.trim(),signal);if(article)return{text:article.text,source:[{title:(getLanguage()==="en"?"Open article: ":"Abrir artigo: ")+article.title,url:article.url,image:article.image}]}}
 catch(e){if(signal?.aborted)throw e}
 const en=getLanguage()==="en";return{text:en?"I couldn’t find a matching Wikipedia article. Try a different phrase or check the spelling.":"Não encontrei um artigo correspondente na Wikipédia. Tente outra expressão ou verifique a escrita do tema.",source:[{title:en?"Search Wikipedia":"Pesquisar na Wikipédia",url:(en?"https://en.wikipedia.org/w/index.php?search=":"https://pt.wikipedia.org/w/index.php?search=")+encodeURIComponent(raw.trim())}]};
}
async function sendMessage(raw){const text=raw.trim(),image=selectedImage;if((!text&&!image)||busy)return;setBusy(true);const id=++requestId;requestController=new AbortController();const signal=requestController.signal;showChat();const shownText=text||(getLanguage()==="en"?"📷 Image sent":"📷 Imagem enviada");render("user",shownText,image?[{image:image.preview,title:image.name}]:null);add("user",shownText);input.value="";resize();clearSelectedImage();activeLoadingRow=typing();try{const a=await answer(text,signal,image);if(id!==requestId||signal.aborted)return;const responseText=limitResponse(a.text);activeLoadingRow?.remove();activeLoadingRow=null;activeResponseItem=add("assistant",responseText,a.source);activeResponseRow=render("assistant",responseText,a.source,true,()=>{if(id===requestId){activeResponseItem=null;activeResponseRow=null;requestController=null;setBusy(false);input.focus()}})}catch(e){if(id!==requestId||signal.aborted)return;activeLoadingRow?.remove();activeLoadingRow=null;render("assistant",e.message|| (getLanguage()==="en"?"An error occurred while processing your message.":"Ocorreu um erro ao processar sua mensagem."),null,false,()=>{if(id===requestId){requestController=null;setBusy(false);input.focus()}});toast(e.message||"Erro inesperado.",true)}}
function theme(t){document.body.classList.toggle("light-mode",t==="light");document.body.classList.toggle("beige-mode",t==="beige");$("#themeButton").textContent=t==="light"?"☾":t==="beige"?"◐":"☼";try{localStorage.setItem(THEME,t)}catch{}applyAccentColor(read(ACCENT_KEY,"#8b7cf6"))}
function showAuth(){$("#authModal").hidden=false;$("#logoutButton").hidden=!user;$("#googleButton").hidden=!!user;$("#guestButton").hidden=!!user;$("#authTitle").textContent=user?"Conta conectada":"Entre na Wiki AI"}
async function updateUser(u){
 const generation=++authGeneration,previousUser=user;
 if(previousUser?.uid&&previousUser.uid!==u?.uid){try{localStorage.setItem("wiki-ai-chats-user-"+previousUser.uid,JSON.stringify(chats))}catch{}}
 cloudReady=false;cloudUid=null;user=u||null;
 $("#userName").textContent=u?.displayName||"Visitante";$("#userEmail").textContent=u?.email||(getLanguage()==="en"?"History on this device":"Histórico neste dispositivo");$("#loginButton").textContent=u?"Minha conta":"Entrar";
 const av=$("#userAvatar");av.replaceChildren();if(u?.photoURL){const img=document.createElement("img");img.src=u.photoURL;img.alt="";av.append(img)}else av.textContent=u?.displayName?.[0]?.toUpperCase()||"W";
 $("#logoutButton").hidden=!u;$("#googleButton").hidden=!!u;$("#guestButton").hidden=!!u;$("#authNote").textContent=u?(u.email||(getLanguage()==="en"?"Signed in with Google.":"Você entrou com Google.")):(getLanguage()==="en"?"Set up Firebase in script.js to enable sign-in.":"Configure o Firebase no script.js para ativar o login.");
 if(!u){const owner=localStorage.getItem(OWNER_KEY);if(!owner){try{localStorage.setItem(GUEST_KEY,JSON.stringify(chats))}catch{}}else chats=read(GUEST_KEY,[]);active=null;messages.replaceChildren();messages.style.display="none";welcome.hidden=false;writeLocal();renderHistory();return}
 try{
  const owner=localStorage.getItem(OWNER_KEY);let localChats=[];
  if(owner===u.uid)localChats=read("wiki-ai-chats-user-"+u.uid,read(KEY,[]));
  else if(!owner){localChats=chats.slice();localStorage.setItem(GUEST_KEY,JSON.stringify(localChats))}
  else localChats=read("wiki-ai-chats-user-"+u.uid,[]);
  const profileRef=db.collection("users").doc(u.uid);const [snapshot,profile]=await Promise.all([profileRef.collection("chats").get(),profileRef.collection("chats").doc("__preferences__").get()]);if(profile.exists&&profile.data()?.preferences)applyCloudPreferences(profile.data().preferences);else{cloudUid=u.uid;cloudReady=true;syncCloudPreferences()}
  if(generation!==authGeneration||user?.uid!==u.uid)return;
  const merged=new Map();
  for(const doc of snapshot.docs){if(doc.id==="__preferences__")continue;const data=doc.data();if(data&&data.id)merged.set(String(data.id),data)}
  for(const chat of localChats){if(!chat?.id)continue;const key=String(chat.id),remote=merged.get(key);if(!remote||(Number(chat.time)||0)>(Number(remote.time)||0))merged.set(key,chat)}
  chats=[...merged.values()].sort((a,b)=>(Number(b.time)||0)-(Number(a.time)||0)).slice(0,50);
  active=null;messages.replaceChildren();messages.style.display="none";welcome.hidden=false;
  cloudUid=u.uid;cloudReady=true;writeLocal();renderHistory();syncCloudChats();syncCloudPreferences();
 }catch(error){if(generation!==authGeneration)return;console.error("Falha ao carregar conversas:",error);console.warn("Não foi possível carregar o histórico da nuvem; usando o histórico local.",error);chats=read("wiki-ai-chats-user-"+u.uid,[]);cloudUid=u.uid;cloudReady=true;writeLocal();renderHistory()}
}
function initAuth(){const configured=FIREBASE_CONFIG.apiKey!=="COLOQUE_SUA_FIREBASE_API_KEY"&&FIREBASE_CONFIG.projectId!=="COLOQUE_SEU_PROJETO"&&FIREBASE_CONFIG.appId!=="COLOQUE_SEU_FIREBASE_APP_ID";if(!configured){$("#googleButton").onclick=()=>toast("Login Google não configurado. Siga as instruções do README.",true);return}try{if(!firebase.apps.length)firebase.initializeApp(FIREBASE_CONFIG);auth=firebase.auth();db=firebase.firestore();auth.onAuthStateChanged(updateUser);$("#authNote").textContent="Login seguro gerenciado pelo Firebase.";$("#googleButton").onclick=async()=>{try{await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());$("#authModal").hidden=true;toast("Login com Google realizado!")}catch(e){toast(e.message||"Falha ao entrar com Google.",true)}}}catch(e){$("#authNote").textContent=e.message}}

const settingsOverlay=$("#settingsOverlay");
function openSettings(){settingsOverlay.hidden=false;document.body.classList.add("settings-open");syncSettings();showSettingsSection("appearance")}
function closeSettings(){settingsOverlay.hidden=true;document.body.classList.remove("settings-open")}
function showSettingsSection(name){document.querySelectorAll("[data-view]").forEach(v=>v.classList.toggle("active",v.dataset.view===name));document.querySelectorAll("[data-section]").forEach(b=>b.classList.toggle("active",b.dataset.section===name))}
function syncSettings(){const themeValue=read(THEME,"dark");searchModeSelect.value=getSearchMode();syncGeminiSettings();document.querySelectorAll("[data-theme-choice]").forEach(b=>b.classList.toggle("selected",b.dataset.themeChoice===themeValue));$("#wordLimitSetting").value=localStorage.getItem(LIMIT_KEY)==="unlimited"?"5100":String(getWordLimit());updateWordLimitValue();$("#textSizeSetting").value=read(TEXT_KEY,"14");$("#languageSetting").value=getLanguage();$("#accentSetting").value=read(ACCENT_KEY,"#8b7cf6");setSettingsSwitch($("#enterToSend"),read(ENTER_KEY,"true")!=="false");setSettingsSwitch($("#animationsSetting"),read(ANIM_KEY,"true")!=="false");renderCustomQA()}
function setSettingsSwitch(el,value){el.classList.toggle("enabled",value);el.setAttribute("aria-checked",String(value))}
function updateImageToggle(){const b=$("#imageModeToggle");if(!b)return;const on=localStorage.getItem(IMAGE_MODE_KEY)==="true";b.classList.toggle("active",on);b.setAttribute("aria-pressed",String(on));const h=$("#imageModeHint");if(h)h.textContent=on?(getLanguage()==="en"?"Wikipedia images enabled":"Imagens da Wikipédia ativadas"):""}
$("#settingsButton").onclick=openSettings;$("#closeSettings").onclick=closeSettings;settingsOverlay.addEventListener("click",e=>{if(e.target===settingsOverlay)closeSettings()});document.querySelectorAll("[data-section]").forEach(b=>b.onclick=()=>showSettingsSection(b.dataset.section));document.querySelectorAll("[data-theme-choice]").forEach(b=>b.onclick=()=>{theme(b.dataset.themeChoice);syncSettings();syncCloudPreferences();toast(getLanguage()==="en"?"Theme updated.":"Tema atualizado.")});$("#textSizeSetting").onchange=e=>{localStorage.setItem(TEXT_KEY,e.target.value);document.querySelectorAll(".message-text").forEach(x=>x.style.fontSize=e.target.value+"px");syncCloudPreferences();toast(getLanguage()==="en"?"Text size updated.":"Tamanho do texto atualizado.")};$("#enterToSend").onclick=()=>{const value=$("#enterToSend").getAttribute("aria-checked")!=="true";setSettingsSwitch($("#enterToSend"),value);localStorage.setItem(ENTER_KEY,String(value));syncCloudPreferences();toast(getLanguage()==="en"?"Send preference updated.":"Preferência de envio atualizada.")};$("#animationsSetting").onclick=()=>{const value=$("#animationsSetting").getAttribute("aria-checked")!=="true";setSettingsSwitch($("#animationsSetting"),value);localStorage.setItem(ANIM_KEY,String(value));syncCloudPreferences();toast(getLanguage()==="en"?"Animations updated.":"Animações atualizadas.")};$("#exportChats").onclick=()=>{if(!chats.length)return toast(getLanguage()==="en"?"There are no conversations to export.":"Não há conversas para exportar.");const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),chats},null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="wiki-ai-conversas.json";a.click();URL.revokeObjectURL(url);toast(getLanguage()==="en"?"Chat history exported.":"Histórico exportado.")};$("#clearChats").onclick=()=>{if(!confirm(getLanguage()==="en"?"Delete all conversations saved on this device? This cannot be undone.":"Apagar todas as conversas salvas neste dispositivo? Essa ação não pode ser desfeita."))return;chats=[];active=null;clearCloudChats();save();renderHistory();messages.replaceChildren();messages.style.display="none";welcome.hidden=false;toast(getLanguage()==="en"?"Chat history deleted.":"Histórico apagado.")};$("#resetSettings").onclick=()=>{if(!confirm(getLanguage()==="en"?"Restore default settings? Your chat history will not be deleted.":"Restaurar as configurações padrão? Seu histórico não será apagado."))return;[THEME,LIMIT_KEY,CUSTOM_LIMIT_KEY,TEXT_KEY,ENTER_KEY,ANIM_KEY,SEARCH_MODE_KEY,LANG_KEY,ACCENT_KEY,IMAGE_MODE_KEY].forEach(k=>localStorage.removeItem(k));theme("dark");searchModeSelect.value="wiki";geminiApiKey="";applyLanguage();syncSettings();syncCloudPreferences();toast(getLanguage()==="en"?"Settings restored.":"Configurações restauradas.")};

const searchModeSelect=$("#searchMode");searchModeSelect.value=getSearchMode();searchModeSelect.onchange=()=>{localStorage.setItem(SEARCH_MODE_KEY,searchModeSelect.value);syncGeminiSettings();syncCloudPreferences();toast((getLanguage()==="en"?"Mode selected: ":"Modo selecionado: ")+searchModeSelect.options[searchModeSelect.selectedIndex].text)};
$("#saveGeminiKey").onclick=()=>{const key=$("#geminiApiKey").value.trim();if(!key)return toast(getLanguage()==="en"?"Paste your API key first.":"Cole sua chave da API primeiro.",true);try{geminiApiKey=key;$("#geminiApiKey").value="";syncGeminiSettings();toast(getLanguage()==="en"?"Gemini key loaded in this page memory.":"Chave do Gemini carregada na memória desta página.")}catch{toast(getLanguage()==="en"?"Could not save the key in this browser tab.":"Não foi possível salvar a chave nesta aba.",true)}};
$("#clearGeminiKey").onclick=()=>{geminiApiKey="";syncGeminiSettings();toast(getLanguage()==="en"?"Gemini key cleared from this page memory.":"Chave do Gemini removida da memória desta página.")};
$("#languageSetting").onchange=e=>{localStorage.setItem(LANG_KEY,e.target.value);applyLanguage();syncCloudPreferences();toast(e.target.value==="en"?"Language changed to English.":"Idioma alterado para português.")};
$("#accentSetting").oninput=e=>{applyAccentColor(e.target.value);syncCloudPreferences()};
$("#saveCustomQA").onclick=()=>{const question=$("#customQuestion").value.trim(),answerText=$("#customAnswer").value.trim();if(!question||!answerText)return toast(getLanguage()==="en"?"Fill in both the question and answer.":"Preencha a pergunta e a resposta.",true);const entries=getCustomQA();const existing=entries.findIndex(item=>norm(item.question)===norm(question));if(existing>=0)entries[existing]={question,answer:answerText};else entries.push({question,answer:answerText});localStorage.setItem(CUSTOM_QA_KEY,JSON.stringify(entries));$("#customQuestion").value="";$("#customAnswer").value="";renderCustomQA();syncCloudPreferences();toast(existing>=0?(getLanguage()==="en"?"Custom answer updated.":"Resposta personalizada atualizada."):(getLanguage()==="en"?"Question and answer saved.":"Pergunta e resposta cadastradas."))};

function clearSelectedImage(){selectedImage=null;const preview=$("#imagePreview");if(preview)preview.hidden=true;const thumb=$("#imagePreviewThumb");if(thumb)thumb.removeAttribute("src");const name=$("#imagePreviewName");if(name)name.textContent="";const file=$("#imageFileInput");if(file)file.value=""}
 function loadImageFile(file){if(!file)return;if(!["image/jpeg","image/png","image/webp"].includes(file.type)){toast(getLanguage()==="en"?"Choose a JPG, PNG or WebP image.":"Escolha uma imagem JPG, PNG ou WebP.",true);return}if(file.size>5*1024*1024){toast(getLanguage()==="en"?"The image must be 5 MB or smaller.":"A imagem precisa ter no máximo 5 MB.",true);return}const reader=new FileReader();reader.onload=()=>{const result=String(reader.result||"");const comma=result.indexOf(",");if(comma<0){toast(getLanguage()==="en"?"Could not read this image.":"Não foi possível ler esta imagem.",true);return}selectedImage={data:result.slice(comma+1),mimeType:file.type,preview:result,name:file.name||"Imagem"};$("#imagePreviewThumb").src=result;$("#imagePreviewName").textContent=file.name||"Imagem selecionada";$("#imagePreview").hidden=false};reader.onerror=()=>toast(getLanguage()==="en"?"Could not read this image.":"Não foi possível ler esta imagem.",true);reader.readAsDataURL(file)}
 $("#attachImageButton").onclick=()=>$("#imageFileInput").click();$("#imageFileInput").onchange=e=>{loadImageFile(e.target.files?.[0]);e.target.value=""};$("#removeImageButton").onclick=clearSelectedImage;input.addEventListener("paste",e=>{const item=[...(e.clipboardData?.items||[])].find(entry=>entry.type.startsWith("image/"));if(item){const file=item.getAsFile();if(file){e.preventDefault();loadImageFile(file)}}});
 function updateWordLimitValue(){const output=$("#wordLimitValue");if(output){const unlimited=localStorage.getItem(LIMIT_KEY)==="unlimited";output.textContent=unlimited?(getLanguage()==="en"?"Unlimited":"Ilimitado"):new Intl.NumberFormat(getLanguage()==="en"?"en-US":"pt-BR").format(getWordLimit())+(getLanguage()==="en"?" words":" palavras")}const end=$("#wordLimitEnd");if(end)end.textContent=getLanguage()==="en"?"Unlimited":"Ilimitado";const start=$("#wordLimitStart");if(start)start.textContent=getLanguage()==="en"?"100 words":"100 palavras"}$("#wordLimitSetting").oninput=e=>{const value=Number(e.target.value);if(value>=5100)localStorage.setItem(LIMIT_KEY,"unlimited");else localStorage.setItem(LIMIT_KEY,String(Math.max(100,Math.min(5000,Math.round(value/100)*100))));localStorage.removeItem(CUSTOM_LIMIT_KEY);updateWordLimitValue();syncCloudPreferences()};$("#imageModeToggle").onclick=()=>{localStorage.setItem(IMAGE_MODE_KEY,String(localStorage.getItem(IMAGE_MODE_KEY)!=="true"));updateImageToggle();syncCloudPreferences()};updateImageToggle();form.onsubmit=e=>{e.preventDefault();if(busy)stopResponse();else sendMessage(input.value)};input.addEventListener("input",resize);input.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey&&read(ENTER_KEY,"true")!=="false"){e.preventDefault();form.requestSubmit()}});document.querySelectorAll("[data-prompt]").forEach(b=>b.onclick=()=>sendMessage(b.dataset.prompt));$("#newChat").onclick=newChat;$("#themeButton").onclick=()=>{theme(document.body.classList.contains("light-mode")?"dark":"light");syncCloudPreferences()};$("#mobileMenu").onclick=()=>sidebar.classList.toggle("open");$("#closeSidebar").onclick=()=>sidebar.classList.remove("open");$("#loginButton").onclick=showAuth;$("#accountMenu").onclick=showAuth;$("#closeAuth").onclick=()=>$("#authModal").hidden=true;$("#guestButton").onclick=()=>$("#authModal").hidden=true;$("#logoutButton").onclick=async()=>{try{if(auth)await auth.signOut();updateUser(null);$("#authModal").hidden=true;toast("Você saiu da conta.")}catch(e){toast(e.message,true)}};$("#authModal").onclick=e=>{if(e.target.id==="authModal")e.currentTarget.hidden=true};document.addEventListener("keydown",e=>{if(e.key==="Escape"){sidebar.classList.remove("open");$("#authModal").hidden=true;closeSettings()}});theme(read(THEME,"dark"));applyAccentColor(read(ACCENT_KEY,"#8b7cf6"));applyLanguage();syncSettings();updateImageToggle();renderHistory();initAuth();
})();