# Controle de Acesso Corporativo — versão empresarial completa

Projeto web para empresa com:
- login do operador
- leitura real de QR Code pela câmera
- cadastro de veículos
- bloqueio/liberação
- histórico de acessos no Supabase
- interface responsiva para celular e coletor

## Arquivos principais
- `app/page.tsx`: tela principal
- `lib/supabaseClient.ts`: conexão com o banco
- `sql/schema.sql`: criação das tabelas

## Antes de publicar
1. Crie um projeto no Supabase.
2. Abra o arquivo `sql/schema.sql` e rode no SQL Editor.
3. Crie um usuário em Auth > Users ou via login de email/senha.
4. Crie o arquivo `.env.local` com:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_COMPANY_NAME`
5. Suba o projeto no Vercel.

## Observação
O QR Code deve conter a tag cadastrada, por exemplo `TAG-001`.

## Rodando localmente
```bash
npm install
npm run dev
```
