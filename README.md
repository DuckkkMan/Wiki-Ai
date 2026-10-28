# Wiki AI — site estático

A Wiki AI roda diretamente no navegador usando **HTML, CSS e JavaScript**, e pode ser publicada no GitHub Pages sem servidor Python.

## Publicar no GitHub Pages

1. Abra **Settings** do repositório.
2. Entre em **Pages**.
3. Em **Build and deployment**, selecione **Deploy from a branch**.
4. Selecione a branch principal (normalmente \`main\`) e a pasta **/(root)**.
5. Clique em **Save** e aguarde a publicação. O endereço aparecerá na mesma página.

O arquivo \`index.html\` precisa ficar na raiz do repositório — ele já está preparado assim.

## Recursos

- Layout responsivo e tema escuro/claro.
- Busca na API pública da Wikipédia em português.
- Links para os artigos originais.
- Histórico de pesquisas e conversas salvo no \`localStorage\` do navegador.
- Abrir e apagar pesquisas anteriores.
- Não exige instalação, Python ou servidor próprio.

## Limites de uma aplicação estática

O histórico fica no navegador atual e não sincroniza entre dispositivos. Não existe cadastro/login seguro ou banco de dados privado nesta versão. Para esses recursos, conecte um serviço de autenticação e backend apropriado; nunca guarde senhas ou chaves secretas no JavaScript público.

A pesquisa usa a Wikipédia como fonte; esta versão não é um modelo generativo de IA. O funcionamento depende de conexão com a internet e da disponibilidade da API da Wikipédia.
