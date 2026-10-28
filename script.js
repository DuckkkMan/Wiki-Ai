(() => {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const form = $("#askForm"), input = $("#question"), askButton = $("#askButton");
  const welcome = $("#welcome"), suggestions = $("#suggestions"), results = $("#results");
  const statusText = $("#statusText"), history = $("#history"), toastRegion = $("#toastRegion");
  const sidebar = $("#sidebar");
  const STORAGE_KEY = "wiki-ai-static-v1";
  let activeId = null, busy = false, historyItems = loadHistory();

  function loadHistory() {
    try { const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); return Array.isArray(value) ? value : []; }
    catch { return []; }
  }
  function saveHistory() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(historyItems.slice(0, 40))); }
    catch { toast("O navegador não permitiu salvar o histórico.", "error"); }
  }
  function toast(message, type = "") {
    const item = document.createElement("div");
    item.className = "toast " + type; item.textContent = message; toastRegion.appendChild(item);
    window.setTimeout(() => item.remove(), 4000);
  }
  function showResults() { welcome.hidden = true; suggestions.hidden = true; results.style.display = "block"; }
  function addMessage(label, text, kind, source) {
    const card = document.createElement("article"); card.className = "message " + (kind === "user" ? "user-message" : "");
    const heading = document.createElement("div"); heading.className = "message-label"; heading.textContent = label;
    const content = document.createElement("div"); content.className = "message-content"; content.textContent = text;
    card.append(heading, content);
    if (source?.url && source?.title) {
      const link = document.createElement("a"); link.className = "source-link";
      link.href = source.url; link.target = "_blank"; link.rel = "noopener noreferrer";
      link.textContent = "↗ Fonte: " + source.title + " (Wikipédia)"; card.appendChild(link);
    }
    results.appendChild(card); card.scrollIntoView({behavior:"smooth", block:"nearest"}); return card;
  }
  function renderHistory() {
    history.replaceChildren();
    if (!historyItems.length) {
      const empty = document.createElement("p"); empty.className = "history-empty";
      empty.textContent = "Suas pesquisas aparecerão aqui neste navegador."; history.appendChild(empty); return;
    }
    historyItems.forEach((item) => {
      const row = document.createElement("div"); row.className = "history-row"; row.dataset.id = item.id;
      const open = document.createElement("button"); open.className = "history-item"; open.title = item.title;
      const symbol = document.createElement("span"); symbol.textContent = "⌕";
      const title = document.createElement("span"); title.textContent = item.title;
      open.append(symbol, title); open.addEventListener("click", () => openConversation(item.id));
      const del = document.createElement("button"); del.className = "delete-chat"; del.textContent = "×";
      del.title = "Excluir pesquisa"; del.setAttribute("aria-label", "Excluir pesquisa");
      del.addEventListener("click", () => {
        historyItems = historyItems.filter((entry) => entry.id !== item.id); saveHistory(); renderHistory();
        if (activeId === item.id) startNewChat();
      });
      row.append(open, del); history.appendChild(row);
    });
  }
  function openConversation(id) {
    const item = historyItems.find((entry) => entry.id === id); if (!item) return;
    activeId = id; results.replaceChildren(); showResults();
    item.messages.forEach((message) => addMessage(message.role === "user" ? "SUA PERGUNTA" : "WIKI AI", message.text, message.role, message.source));
    statusText.textContent = "Pesquisa carregada do histórico"; sidebar.classList.remove("open");
  }
  function startNewChat() {
    activeId = null; results.replaceChildren(); results.style.display = "none";
    welcome.hidden = false; suggestions.hidden = false; statusText.textContent = "Pronta para pesquisar";
    input.value = ""; input.focus(); sidebar.classList.remove("open");
  }
  function extractPlainText(html) {
    const doc = new DOMParser().parseFromString(html || "", "text/html");
    doc.querySelectorAll("sup, style, script").forEach((node) => node.remove());
    return (doc.body.textContent || "").replace(/\[\d+\]/g, "").replace(/\s+/g, " ").trim();
  }
  async function searchWikipedia(question) {
    const endpoint = "https://pt.wikipedia.org/w/api.php";
    const params = new URLSearchParams({
      action:"query", list:"search", srsearch:question, srlimit:"1",
      format:"json", origin:"*", utf8:"1"
    });
    const searchResponse = await fetch(endpoint + "?" + params.toString());
    if (!searchResponse.ok) throw new Error("A Wikipédia não respondeu. Tente novamente.");
    const searchData = await searchResponse.json();
    const hit = searchData?.query?.search?.[0];
    if (!hit) throw new Error("Não encontrei um artigo. Experimente outras palavras-chave.");
    const summaryParams = new URLSearchParams({
      action:"query", prop:"extracts", exintro:"1", explaintext:"1",
      redirects:"1", titles:hit.title, format:"json", origin:"*", utf8:"1"
    });
    const summaryResponse = await fetch(endpoint + "?" + summaryParams.toString());
    if (!summaryResponse.ok) throw new Error("Encontrei o artigo, mas não consegui carregar o resumo.");
    const summaryData = await summaryResponse.json();
    const page = Object.values(summaryData?.query?.pages || {})[0];
    let text = extractPlainText(page?.extract);
    if (!text) throw new Error("O artigo não tem um resumo disponível. Tente outra pesquisa.");
    if (text.length > 2800) text = text.slice(0, 2800).replace(/\s+\S*$/, "") + "…";
    return {title:page?.title || hit.title, text, url:"https://pt.wikipedia.org/wiki/" + encodeURIComponent((page?.title || hit.title).replace(/ /g, "_")).replace(/%28/g,"(").replace(/%29/g,")")};
  }
  async function sendQuestion(rawQuestion) {
    const question = rawQuestion.trim(); if (busy || !question) return;
    if (question.length > 250) { toast("A pergunta pode ter no máximo 250 caracteres.", "error"); return; }
    busy = true; askButton.disabled = true; askButton.innerHTML = "PESQUISANDO…";
    showResults(); addMessage("SUA PERGUNTA", question, "user");
    const loading = addMessage("WIKI AI", "Consultando a Wikipédia…", "assistant");
    const dots = document.createElement("div"); dots.className = "loading-dots";
    dots.innerHTML = "<span></span><span></span><span></span>"; loading.appendChild(dots);
    statusText.textContent = "Pesquisando na Wikipédia…";
    try {
      const article = await searchWikipedia(question);
      loading.remove(); addMessage("WIKI AI · " + article.title.toUpperCase(), article.text, "assistant", {title:article.title,url:article.url});
      let item = historyItems.find((entry) => entry.id === activeId);
      if (!item) {
        item = {id:crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), title:question.slice(0,58), messages:[]};
        historyItems.unshift(item); activeId = item.id;
      }
      item.title = item.messages.length ? item.title : question.slice(0,58);
      item.messages.push({role:"user",text:question},{role:"assistant",text:article.text,source:{title:article.title,url:article.url}});
      item.updatedAt = Date.now(); historyItems = historyItems.filter((entry) => entry.id !== item.id).concat(historyItems.filter((entry) => entry.id === item.id));
      historyItems.sort((a,b) => (b.updatedAt || 0) - (a.updatedAt || 0)); historyItems = historyItems.slice(0,40);
      saveHistory(); renderHistory(); statusText.textContent = "Resposta recebida";
    } catch (error) {
      loading.remove(); addMessage("PESQUISA NÃO CONCLUÍDA", error.message || "Ocorreu um erro inesperado.", "assistant");
      statusText.textContent = "Não foi possível concluir"; toast(error.message || "Erro inesperado.", "error");
    } finally {
      busy = false; askButton.disabled = false; askButton.innerHTML = 'PESQUISAR <span>↗</span>';
      input.value = ""; input.focus();
    }
  }
  form.addEventListener("submit", (event) => { event.preventDefault(); sendQuestion(input.value); });
  document.querySelectorAll("[data-prompt]").forEach((button) => button.addEventListener("click", () => sendQuestion(button.dataset.prompt)));
  $("#newChat").addEventListener("click", startNewChat);
  $("#clearHistory").addEventListener("click", () => {
    if (!historyItems.length) { toast("O histórico já está vazio."); return; }
    if (!window.confirm("Apagar todas as pesquisas salvas neste navegador?")) return;
    historyItems = []; saveHistory(); renderHistory(); startNewChat(); toast("Histórico apagado.");
  });
  $("#mobileMenu").addEventListener("click", () => sidebar.classList.toggle("open"));
  $("#themeButton").addEventListener("click", () => {
    const light = document.body.classList.toggle("light-mode");
    try { localStorage.setItem("wiki-ai-theme", light ? "light" : "dark"); } catch {}
  });
  try { if (localStorage.getItem("wiki-ai-theme") === "light") document.body.classList.add("light-mode"); } catch {}
  document.addEventListener("click", (event) => {
    if (window.innerWidth <= 680 && sidebar.classList.contains("open") && !sidebar.contains(event.target) && !$("#mobileMenu").contains(event.target)) sidebar.classList.remove("open");
  });
  renderHistory();
})();