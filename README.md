# Wiki AI — GitHub Pages

Chatbot estático em HTML, CSS e JavaScript, com interface inspirada em chats modernos, tema claro/escuro, histórico local e pesquisa na Wikipédia.

## Publicar
1. Abra **Settings → Pages**.
2. Selecione **Deploy from a branch**, branch `main` e pasta `/(root)`.
3. Salve e aguarde o endereço aparecer na página.

## Ativar login Google
1. Crie um projeto em https://console.firebase.google.com/.
2. Em **Authentication → Sign-in method**, habilite **Google**.
3. Em **Authentication → Settings → Authorized domains**, adicione `duckkkman.github.io`.
4. Adicione um aplicativo Web nas configurações do projeto e copie a configuração Firebase.
5. No começo de `script.js`, substitua os valores de `FIREBASE_CONFIG` por `apiKey`, `authDomain`, `projectId` e `appId` do seu projeto.
6. Faça commit e aguarde o Pages atualizar.

A configuração web do Firebase é feita para uso no cliente, mas restrinja a chave por domínio. Nunca publique credenciais privadas ou chaves de conta de serviço.

## Recursos e limitações
- Chat responsivo, tema claro/escuro e histórico salvo neste navegador.
- Respostas locais para saudações e mensagens simples.
- Pesquisa na Wikipédia em português com link da fonte.
- Login Google opcional com Firebase Authentication.
- Esta versão ainda não usa um modelo generativo completo como o ChatGPT; para isso, é necessário conectar um serviço de IA por um backend seguro.
- O histórico fica neste navegador. Sincronização entre dispositivos requer banco de dados e regras de acesso.
