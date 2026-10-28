# Wiki AI

Site de perguntas e respostas em Python com pesquisa na Wikipédia em português.

## O que já está incluído

- Interface responsiva em HTML, CSS e JavaScript.
- Backend Flask em Python.
- Pesquisa de artigos na Wikipédia em português, com link da fonte.
- Cadastro e login por e-mail e senha (senhas armazenadas com hash).
- Login Google opcional via OAuth 2.0.
- Histórico de conversas individual por conta, salvo em SQLite.
- Abrir e excluir conversas salvas.
- Arquivo de exemplo de configuração e exclusão de segredos pelo Git.

> A pesquisa atual consulta a Wikipédia e mostra o texto do artigo. Ela ainda não usa um modelo generativo de IA; essa integração pode ser adicionada depois.

## Executar no Windows

Instale Python 3.11 ou mais recente e, no terminal, dentro da pasta do projeto, rode:

~~~powershell
py -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
Copy-Item .env.example .env
py app.py
~~~

Abra http://127.0.0.1:5000 no navegador.

O banco SQLite será criado automaticamente em instance/wiki_ai.sqlite3.

## Configurar login Google (opcional)

1. Abra o Google Cloud Console e crie um projeto.
2. Configure a tela de consentimento OAuth.
3. Crie um OAuth Client ID do tipo Aplicativo da Web.
4. Para testar localmente, adicione http://127.0.0.1:5000 às origens JavaScript autorizadas.
5. Adicione http://127.0.0.1:5000/auth/google/callback aos URIs de redirecionamento autorizados.
6. Copie o Client ID e o Client Secret para o arquivo .env:

~~~env
SECRET_KEY=coloque-uma-chave-aleatoria-longa-aqui
FLASK_DEBUG=1
DATABASE_PATH=instance/wiki_ai.sqlite3
GOOGLE_CLIENT_ID=seu-client-id
GOOGLE_CLIENT_SECRET=seu-client-secret
~~~

Para gerar uma chave de sessão aleatória, rode:

~~~powershell
py -c "import secrets; print(secrets.token_hex(32))"
~~~

Copie o resultado para SECRET_KEY. Depois de alterar .env, reinicie o servidor. Se as credenciais do Google ficarem vazias, o site continuará funcionando com login por e-mail e senha.

## Segurança antes de publicar

- Nunca envie o arquivo .env, Client Secret ou chave de sessão ao GitHub.
- Para produção, defina FLASK_DEBUG=0, use HTTPS e configure COOKIE_SECURE=1.
- Use um servidor WSGI adequado para hospedar publicamente; o servidor de desenvolvimento do Flask serve apenas para testes.
- Antes de abrir o site ao público, adicione proteção contra tentativas repetidas de login e limites de requisições.
