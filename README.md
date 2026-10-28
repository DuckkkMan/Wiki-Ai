# Wiki AI

Site de perguntas e respostas em Python com pesquisa na Wikipédia em português.

## Requisitos
- Python 3.11+

## Executar no Windows

```powershell
py -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
Copy-Item .env.example .env
py app.py
```

Abra http://127.0.0.1:5000.

## Login Google (opcional)
O site funciona sem login Google. Para ativá-lo, configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `SECRET_KEY` no `.env`, e cadastre `http://127.0.0.1:5000/auth/google/callback` como URI de redirecionamento autorizado no Google Cloud Console.

Nunca publique seu `.env` nem suas credenciais.

## Recursos
- Pesquisa na Wikipédia em português e links de fontes.
- Conversas salvas em SQLite para usuários autenticados.
- Login local por e-mail e senha, com hash seguro.
- Login Google opcional via OAuth.
- Interface responsiva em HTML, CSS e JavaScript.
