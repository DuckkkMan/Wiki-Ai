(() => {
  const isAuthenticated = document.body.dataset.authenticated === "true";
  const form = document.getElementById("askForm");
  const input = document.getElementById("question");
  const askButton = document.getElementById("askButton");
  const welcome = document.getElementById("welcome");
  const suggestions = document.getElementById("suggestions");
  const results = document.getElementById("results");
  const statusText = document.getElementById("statusText");
  const history = document.getElementById("history");
  const toastRegion = document.getElementById("toastRegion");
  const newChat = document.getElementById("newChat");
  const mobileMenu = document.getElementById("mobileMenu");
  const sidebar = document.getElementById("sidebar");
  let conversationId = null;
  let csrfToken = null;
  let busy = false;

  function toast(message, type) {
    const item = document.createElement("div");
    item.className = "toast " + (type || "");
    item.textContent = message;
    toastRegion.appendChild(item);
    window.setTimeout(() => item.remove(), 4200);
  }

  async function getCsrf() {
    if (csrfToken) return csrfToken;
    const response = await fetch("/api/csrf");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Entre na sua conta para usar o chat.");
    csrfToken = data.csrf_token;
    return csrfToken;
  }

  function showResults() {
    welcome.hidden = true;
    suggestions.hidden = true;
    results.style.display = "block";
  }

  function addMessage(label, text, kind, source) {
    const card = document.createElement("article");
    card.className = "message " + (kind === "user" ? "user-message" : "");
    const heading = document.createElement("div");
    heading.className = "message-label";
    heading.textContent = label;
    const content = document.createElement("div");
    content.className = "message-content";
    content.textContent = text;
    card.append(heading, content);
    if (source && source.url && source.title) {
      const link = document.createElement("a");
      link.className = "source-link";
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "↗ Fonte: " + source.title + " (Wikipédia)";
      card.appendChild(link);
    }
    results.appendChild(card);
    card.scrollIntoView({behavior:"smooth", block:"nearest"});
    return card;
  }

  function addHistory(id, title) {
    const existing = history.querySelector('[data-conversation="' + id + '"]');
    if (existing) {
      const label = existing.querySelector(".history-item span");
      if (label) label.textContent = title;
      history.prepend(existing);
      return;
    }
    const empty = history.querySelector(".history-empty");
    if (empty) empty.remove();
    const row = document.createElement("div");
    row.className = "history-row";
    row.dataset.conversation = id;
    const open = document.createElement("button");
    open.className = "history-item";
    open.dataset.openConversation = id;
    open.title = title;
    open.innerHTML = "<span></span>";
    open.firstElementChild.textContent = title;
    const del = document.createElement("button");
    del.className = "delete-chat";
    del.dataset.deleteConversation = id;
    del.title = "Excluir conversa";
    del.setAttribute("aria-label", "Excluir conversa");
    del.textContent = "×";
    row.append(open, del);
    history.prepend(row);
  }

  async function sendQuestion(question) {
    if (busy) return;
    if (!question.trim()) { input.focus(); return; }
    if (!isAuthenticated) {
      toast("Entre ou crie uma conta para pesquisar e salvar seu histórico.");
      window.location.href = "/login";
      return;
    }
    busy = true;
    askButton.disabled = true;
    askButton.textContent = "PESQUISANDO…";
    statusText.textContent = "Pesquisando na Wikipédia…";
    showResults();
    addMessage("SUA PERGUNTA", question, "user", null);
    const loading = addMessage("WIKI AI", "Consultando a Wikipédia…", "assistant", null);
    const dots = document.createElement("div");
    dots.className = "loading-dots";
    dots.innerHTML = "<span></span><span></span><span></span>";
    loading.appendChild(dots);
    try {
      const token = await getCsrf();
      const response = await fetch("/api/ask", {
        method:"POST",
        headers:{"Content-Type":"application/json","X-CSRF-Token":token},
        body:JSON.stringify({question:question,conversation_id:conversationId})
      });
      const data = await response.json();
      loading.remove();
      if (!response.ok) throw new Error(data.error || "Não foi possível obter uma resposta.");
      conversationId = data.conversation_id;
      addMessage("WIKI AI", data.answer, "assistant", data.source);
      const title = question.length > 58 ? question.slice(0,58) + "…" : question;
      addHistory(conversationId, title);
      statusText.textContent = "Resposta recebida";
    } catch (error) {
      loading.remove();
      addMessage("NÃO FOI POSSÍVEL RESPONDER", error.message || "Erro inesperado.", "assistant", null);
      statusText.textContent = "Não foi possível concluir";
      if ((error.message || "").includes("Entre na sua conta")) window.location.href = "/login";
      else toast(error.message || "Ocorreu um erro.", "error");
    } finally {
      busy = false;
      askButton.disabled = false;
      askButton.innerHTML = 'PESQUISAR <span>↗</span>';
      input.value = "";
      input.focus();
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    sendQuestion(input.value.trim());
  });
  document.querySelectorAll("[data-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      input.value = button.dataset.prompt;
      sendQuestion(input.value);
    });
  });
  newChat.addEventListener("click", () => {
    conversationId = null;
    results.replaceChildren();
    results.style.display = "none";
    welcome.hidden = false;
    suggestions.hidden = false;
    statusText.textContent = "Pronta para pesquisar";
    input.value = "";
    input.focus();
    sidebar.classList.remove("open");
  });

  history.addEventListener("click", async (event) => {
    const openButton = event.target.closest("[data-open-conversation]");
    const deleteButton = event.target.closest("[data-delete-conversation]");
    if (openButton) {
      const id = openButton.dataset.openConversation;
      try {
        const response = await fetch("/api/conversations/" + id);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Não consegui abrir essa conversa.");
        conversationId = Number(id);
        results.replaceChildren();
        showResults();
        data.messages.forEach((message) => {
          const source = message.source_url ? {title:message.source_title,url:message.source_url} : null;
          addMessage(message.role === "user" ? "SUA PERGUNTA" : "WIKI AI", message.content, message.role, source);
        });
        statusText.textContent = "Histórico carregado";
        sidebar.classList.remove("open");
      } catch (error) { toast(error.message, "error"); }
      return;
    }
    if (deleteButton) {
      const id = deleteButton.dataset.deleteConversation;
      if (!window.confirm("Excluir esta conversa permanentemente?")) return;
      try {
        const token = await getCsrf();
        const response = await fetch("/api/conversations/" + id, {method:"DELETE",headers:{"X-CSRF-Token":token}});
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Não foi possível excluir.");
        deleteButton.closest(".history-row").remove();
        if (Number(conversationId) === Number(id)) newChat.click();
        toast("Conversa excluída.");
      } catch (error) { toast(error.message, "error"); }
    }
  });

  mobileMenu.addEventListener("click", () => sidebar.classList.toggle("open"));
  document.addEventListener("click", (event) => {
    if (window.innerWidth <= 680 && sidebar.classList.contains("open") &&
        !sidebar.contains(event.target) && !mobileMenu.contains(event.target)) sidebar.classList.remove("open");
  });
})();
