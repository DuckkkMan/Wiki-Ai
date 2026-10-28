import os
import re
import secrets
import sqlite3
from functools import wraps
from urllib.parse import quote

import requests
from authlib.integrations.flask_client import OAuth
from dotenv import load_dotenv
from flask import Flask, abort, flash, jsonify, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

load_dotenv()
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DATABASE_PATH = os.getenv("DATABASE_PATH", os.path.join(BASE_DIR, "instance", "wiki_ai.sqlite3"))
if not os.path.isabs(DATABASE_PATH):
    DATABASE_PATH = os.path.join(BASE_DIR, DATABASE_PATH)

app = Flask(__name__)
app.config.update(
    SECRET_KEY=os.getenv("SECRET_KEY") or secrets.token_hex(32),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.getenv("COOKIE_SECURE", "0") == "1",
)
WIKI_API = "https://pt.wikipedia.org/w/api.php"
oauth = OAuth(app)
google_enabled = bool(os.getenv("GOOGLE_CLIENT_ID") and os.getenv("GOOGLE_CLIENT_SECRET"))
if google_enabled:
    oauth.register(
        name="google",
        client_id=os.getenv("GOOGLE_CLIENT_ID"),
        client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )


def db():
    os.makedirs(os.path.dirname(DATABASE_PATH), exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db():
    with db() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT,
            google_sub TEXT UNIQUE,
            avatar_url TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title TEXT NOT NULL DEFAULT 'Nova conversa',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            role TEXT NOT NULL CHECK(role IN ('user','assistant')),
            content TEXT NOT NULL,
            source_title TEXT,
            source_url TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        """)


def current_user():
    user_id = session.get("user_id")
    if not user_id:
        return None
    with db() as conn:
        row = conn.execute(
            "SELECT id, name, email, avatar_url FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    if not row:
        session.clear()
        return None
    return dict(row)


def login_required(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        if not current_user():
            flash("Entre na sua conta para continuar.", "info")
            return redirect(url_for("login", next=request.path))
        return fn(*args, **kwargs)
    return wrapped


def safe_next(value):
    if value and value.startswith("/") and not value.startswith("//"):
        return value
    return url_for("index")


def search_wikipedia(question):
    headers = {"User-Agent": "WikiAI/1.0 (educational project)"}
    response = requests.get(
        WIKI_API,
        params={"action": "query", "list": "search", "srsearch": question,
                "srlimit": 1, "format": "json", "utf8": 1},
        headers=headers, timeout=12,
    )
    response.raise_for_status()
    hits = response.json().get("query", {}).get("search", [])
    if not hits:
        return None
    title = hits[0]["title"]
    summary_response = requests.get(
        WIKI_API,
        params={"action": "query", "prop": "extracts", "exintro": 1,
                "explaintext": 1, "redirects": 1, "titles": title,
                "format": "json", "utf8": 1},
        headers=headers, timeout=12,
    )
    summary_response.raise_for_status()
    pages = summary_response.json().get("query", {}).get("pages", {})
    article = next(iter(pages.values()), {})
    extract = re.sub(r"\n{3,}", "\n\n", (article.get("extract") or "").strip())
    if not extract:
        return None
    if len(extract) > 2400:
        cut = extract[:2400]
        last_space = cut.rfind(" ")
        extract = (cut[:last_space] if last_space > 1200 else cut) + "…"
    return {
        "title": title,
        "text": extract,
        "url": "https://pt.wikipedia.org/wiki/" + quote(title.replace(" ", "_"), safe="()"),
    }


def answer_question(question):
    lowered = question.strip().casefold().rstrip("!?., ")
    social = {
        "oi": "Oi! Sou a Wiki AI. O que você quer descobrir?",
        "olá": "Olá! Sou a Wiki AI. O que você quer descobrir?",
        "ola": "Olá! Sou a Wiki AI. O que você quer descobrir?",
        "bom dia": "Bom dia! Qual assunto vamos explorar?",
        "boa tarde": "Boa tarde! Qual assunto vamos explorar?",
        "boa noite": "Boa noite! Qual assunto vamos explorar?",
        "obrigado": "Por nada! Se quiser, podemos pesquisar outro assunto.",
        "obrigada": "Por nada! Se quiser, podemos pesquisar outro assunto.",
        "quem é você": "Sou a Wiki AI, um assistente que procura informações na Wikipédia em português e mostra as fontes.",
        "qual seu nome": "Sou a Wiki AI, seu assistente de pesquisa.",
    }
    if lowered in social:
        return {"ok": True, "text": social[lowered], "source": None}
    try:
        article = search_wikipedia(question)
    except requests.RequestException:
        return {"ok": False, "error": "Não consegui acessar a Wikipédia agora. Confira sua conexão e tente novamente."}
    except (ValueError, KeyError, TypeError):
        return {"ok": False, "error": "A resposta da Wikipédia veio em um formato inesperado. Tente novamente."}
    if not article:
        return {"ok": False, "error": "Não encontrei um artigo adequado. Tente usar palavras-chave mais específicas."}
    return {"ok": True, "text": article["text"],
            "source": {"title": article["title"], "url": article["url"]}}


@app.after_request
def security_headers(response):
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    return response


@app.route("/")
def index():
    user = current_user()
    conversations = []
    if user:
        with db() as conn:
            conversations = conn.execute(
                "SELECT id, title, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 40",
                (user["id"],),
            ).fetchall()
    return render_template("index.html", user=user, conversations=conversations, google_enabled=google_enabled)


@app.route("/register", methods=["GET", "POST"])
def register():
    if current_user():
        return redirect(url_for("index"))
    if request.method == "POST":
        name = request.form.get("name", "").strip()[:80]
        email = request.form.get("email", "").strip().lower()[:254]
        password = request.form.get("password", "")
        if not name or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
            flash("Informe um nome e um e-mail válido.", "error")
        elif len(password) < 8:
            flash("A senha precisa ter pelo menos 8 caracteres.", "error")
        else:
            try:
                with db() as conn:
                    cursor = conn.execute(
                        "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
                        (name, email, generate_password_hash(password)),
                    )
                    session.clear()
                    session["user_id"] = cursor.lastrowid
                    session["csrf_token"] = secrets.token_urlsafe(32)
                return redirect(url_for("index"))
            except sqlite3.IntegrityError:
                flash("Já existe uma conta com esse e-mail. Tente entrar.", "error")
    return render_template("auth.html", mode="register", google_enabled=google_enabled)


@app.route("/login", methods=["GET", "POST"])
def login():
    if current_user():
        return redirect(url_for("index"))
    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        with db() as conn:
            user = conn.execute("SELECT id, password_hash FROM users WHERE email = ?", (email,)).fetchone()
        if user and user["password_hash"] and check_password_hash(user["password_hash"], password):
            session.clear()
            session["user_id"] = user["id"]
            session["csrf_token"] = secrets.token_urlsafe(32)
            return redirect(safe_next(request.args.get("next")))
        flash("E-mail ou senha incorretos.", "error")
    return render_template("auth.html", mode="login", google_enabled=google_enabled)


@app.post("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))


@app.get("/auth/google")
def google_login():
    if not google_enabled:
        flash("O login Google ainda não foi configurado.", "info")
        return redirect(url_for("login"))
    return oauth.google.authorize_redirect(url_for("google_callback", _external=True))


@app.get("/auth/google/callback")
def google_callback():
    if not google_enabled:
        abort(404)
    try:
        token = oauth.google.authorize_access_token()
        info = token.get("userinfo") or oauth.google.userinfo()
    except Exception:
        flash("Não foi possível concluir o login Google. Tente novamente.", "error")
        return redirect(url_for("login"))
    if not info or not info.get("email") or not info.get("email_verified"):
        flash("O Google não confirmou um e-mail válido para esta conta.", "error")
        return redirect(url_for("login"))
    email = info["email"].lower()
    google_sub = info.get("sub")
    with db() as conn:
        user = conn.execute("SELECT id FROM users WHERE google_sub = ?", (google_sub,)).fetchone()
        if not user:
            user = conn.execute("SELECT id, google_sub FROM users WHERE email = ?", (email,)).fetchone()
            if user:
                if user["google_sub"] is None:
                    conn.execute(
                        "UPDATE users SET google_sub = ?, avatar_url = COALESCE(?, avatar_url), name = ? WHERE id = ?",
                        (google_sub, info.get("picture"), info.get("name", "Usuário")[:80], user["id"]),
                    )
                else:
                    flash("Esse e-mail já está vinculado a outra identidade de login.", "error")
                    return redirect(url_for("login"))
            else:
                cursor = conn.execute(
                    "INSERT INTO users (name, email, google_sub, avatar_url) VALUES (?, ?, ?, ?)",
                    (info.get("name", "Usuário")[:80], email, google_sub, info.get("picture")),
                )
                user = {"id": cursor.lastrowid}
    session.clear()
    session["user_id"] = user["id"]
    session["csrf_token"] = secrets.token_urlsafe(32)
    return redirect(url_for("index"))


def verify_csrf():
    token = request.headers.get("X-CSRF-Token", "")
    expected = session.get("csrf_token", "")
    return bool(token and expected and secrets.compare_digest(token, expected))


@app.get("/api/csrf")
def csrf_token():
    if not current_user():
        return jsonify({"error": "Entre na sua conta para usar o chat."}), 401
    token = session.setdefault("csrf_token", secrets.token_urlsafe(32))
    return jsonify({"csrf_token": token})


@app.post("/api/ask")
@login_required
def ask():
    if not verify_csrf():
        return jsonify({"error": "Sessão expirada. Atualize a página e tente novamente."}), 403
    payload = request.get_json(silent=True) or {}
    question = payload.get("question")
    if not isinstance(question, str):
        return jsonify({"error": "Envie uma pergunta válida."}), 400
    question = question.strip()
    if not question:
        return jsonify({"error": "Digite uma pergunta."}), 400
    if len(question) > 250:
        return jsonify({"error": "A pergunta deve ter no máximo 250 caracteres."}), 400
    result = answer_question(question)
    if not result["ok"]:
        return jsonify({"error": result["error"]}), 502
    user = current_user()
    conversation_id = payload.get("conversation_id")
    with db() as conn:
        conversation = None
        if conversation_id:
            conversation = conn.execute(
                "SELECT id FROM conversations WHERE id = ? AND user_id = ?",
                (conversation_id, user["id"]),
            ).fetchone()
        if not conversation:
            title = question[:58] + ("…" if len(question) > 58 else "")
            cursor = conn.execute(
                "INSERT INTO conversations (user_id, title) VALUES (?, ?)",
                (user["id"], title or "Nova conversa"),
            )
            conversation_id = cursor.lastrowid
        conn.execute(
            "INSERT INTO messages (conversation_id, role, content) VALUES (?, 'user', ?)",
            (conversation_id, question),
        )
        source = result.get("source") or {}
        conn.execute(
            "INSERT INTO messages (conversation_id, role, content, source_title, source_url) VALUES (?, 'assistant', ?, ?, ?)",
            (conversation_id, result["text"], source.get("title"), source.get("url")),
        )
        conn.execute("UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (conversation_id,))
    return jsonify({"answer": result["text"], "source": result.get("source"), "conversation_id": conversation_id})


@app.get("/api/conversations/<int:conversation_id>")
@login_required
def get_conversation(conversation_id):
    user = current_user()
    with db() as conn:
        conversation = conn.execute(
            "SELECT id, title FROM conversations WHERE id = ? AND user_id = ?",
            (conversation_id, user["id"]),
        ).fetchone()
        if not conversation:
            abort(404)
        messages = conn.execute(
            "SELECT role, content, source_title, source_url, created_at FROM messages WHERE conversation_id = ? ORDER BY id",
            (conversation_id,),
        ).fetchall()
    return jsonify({"conversation": dict(conversation), "messages": [dict(row) for row in messages]})


@app.delete("/api/conversations/<int:conversation_id>")
@login_required
def delete_conversation(conversation_id):
    if not verify_csrf():
        return jsonify({"error": "Sessão expirada. Atualize a página."}), 403
    user = current_user()
    with db() as conn:
        conn.execute("DELETE FROM conversations WHERE id = ? AND user_id = ?", (conversation_id, user["id"]))
    return jsonify({"ok": True})


@app.errorhandler(413)
def too_large(_error):
    return jsonify({"error": "Solicitação muito grande."}), 413


init_db()
if __name__ == "__main__":
    debug = os.getenv("FLASK_DEBUG", "0") == "1"
    app.run(host="127.0.0.1", port=int(os.getenv("PORT", "5000")), debug=debug)
