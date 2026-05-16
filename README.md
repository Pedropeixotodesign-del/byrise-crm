# CRM de Clientes com Supabase e Netlify

Este projeto é uma versão ajustada do CRM para funcionar com:

- React + Vite
- Supabase Auth
- Supabase Database
- Supabase Storage para logos e contratos em PDF
- Deploy no Netlify

## 1. Instalar

```bash
npm install
```

## 2. Configurar Supabase

1. Abra o Supabase.
2. Vá em SQL Editor.
3. Rode o arquivo `supabase-schema.sql`.
4. Em Authentication > Providers, deixe Email ativo.

## 3. Configurar variáveis de ambiente

Crie o arquivo `.env.local` com base no `.env.example`:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=SUA_CHAVE_PUBLICAVEL
```

Você encontra esses dados no Supabase em Project Settings ou no botão Connect do projeto.

## 4. Rodar localmente

```bash
npm run dev
```

## 5. Deploy no Netlify

No Netlify, use:

- Build command: `npm run build`
- Publish directory: `dist`

Adicione também as variáveis de ambiente no painel do Netlify:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

## Observação

Os buckets `client-logos` e `contracts` foram configurados como privados no SQL. O app gera links temporários para exibir logos e abrir contratos.
