# Metrix · Meta Ads Dashboard

Dashboard independente para consultar e visualizar métricas da Meta Marketing API. O frontend chama a Graph API diretamente; não há servidor próprio nem dados de CRM.

## Rodar localmente

1. Instale Node.js 18 ou superior.
2. Copie `.env.local.example` para `.env.local`.
3. Preencha `VITE_META_ACCESS_TOKEN` com um token que tenha acesso de leitura às contas de anúncios.
4. Rode `npm install` e `npm run dev`.
5. Abra o endereço local exibido pelo Vite.

O dashboard começa em `?preset=365d&view=meta_ads`. Sem token, ele mostra dados de demonstração marcados como fictícios.

## Configuração do token

```env
VITE_META_ACCESS_TOKEN=seu_token_meta
VITE_META_GRAPH_VERSION=v25.0
```

Vite inclui variáveis `VITE_` no JavaScript entregue ao navegador. Assim, o token fica visível no código compilado, nas ferramentas do navegador e nas requisições feitas à Meta. O arquivo `.env.local` está ignorado pelo Git para evitar que o valor seja enviado por acidente junto com o código-fonte; isso não torna o token secreto no app publicado.

Use apenas em um app pessoal/controlado, com token de leitura e acesso limitado às contas necessárias. Não publique um token real em repositório público ou em um site acessível a outras pessoas. Se for necessário esconder o token de visitantes, a arquitetura precisa de um backend ou proxy seguro.

## Métricas

- Investimento total inclui todos os objetivos.
- Investimento em cadastro e CPL usam somente campanhas cujo objetivo oficial seja geração de leads.
- Leads, conversas, visitas ao perfil e visualizações de destino são ações reportadas pela Meta.
- CPL = gasto em campanhas de geração de leads ÷ leads dessas campanhas.
- Frequência = impressões ÷ alcance; CTR = cliques ÷ impressões; CPM = gasto ÷ impressões × 1.000; CPC = gasto ÷ cliques.
- O app não consulta CRM, vendas ou leads confirmados fora do Meta Ads.

## Páginas por empresa

A tela `/admbossnetofelk` configura uma URL para cada empresa e associa essa página a um ID de conta Meta. A rota já configurada é `/atacadao`, para **Atacadão dos Eletros**, usando o ID `385159223168893`.

Ao abrir `/`, a pessoa informa a senha `netoboss` e recebe a lista de dashboards. As páginas de empresa podem ser abertas por link direto sem senha. A tela admin `/admbossnetofelk` pede a senha. Como a senha e o token estão em um app frontend, a senha do portal é apenas uma barreira visual e pode ser inspecionada no código publicado.

O botão de salvar no admin guarda a configuração apenas no navegador atual. Para publicar as rotas para todas as pessoas, exporte `tenant-config.json`, substitua `public/tenant-config.json` por esse arquivo e publique o projeto novamente.

## Publicar

O build gera arquivos estáticos em `dist/`, que podem ser servidos pelo GitHub Pages ou outro host estático. O `vercel.json` reescreve URLs de páginas, como `/atacadao`, para o app SPA. Para consultar dados reais após publicar, a variável `VITE_META_ACCESS_TOKEN` precisa estar disponível durante o build. Como ela será incorporada ao frontend, qualquer pessoa com acesso ao app publicado poderá inspecioná-la.
