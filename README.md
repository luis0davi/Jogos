# ThermoLink — Dashboard Web

Arquivos:
- index.html
- style.css
- app.js

## 1. Configurar o Supabase

Abra `app.js` e coloque sua chave pública `anon`/`publishable`:

```js
const SUPABASE_URL = "https://zawnluboujbovpgrgdcx.supabase.co";
const SUPABASE_ANON_KEY = "SUA_CHAVE_PUBLICA";
```

NUNCA coloque a chave `service_role` no GitHub Pages.

## 2. Estrutura esperada

O código foi feito para a estrutura mostrada nos seus prints:

### empresas
- id
- nome
- ativo

### fornos
- id
- dispositivo_id
- numero
- nome
- módulo_atual
- ativo

### leituras
- id
- dispositivo_id
- forno_id
- módulo_atual
- canal_1
- canal_2
- data_hora

A regra usada no dashboard é:
`módulo_atual = número do forno`.

A temperatura exibida como principal é `canal_1`.

## 3. GitHub Pages

Suba os três arquivos para o repositório e ative:
Settings → Pages → Deploy from branch → main → / (root)

## 4. Supabase / RLS

A chave pública só consegue consultar o que as políticas RLS permitirem. Para um dashboard público, crie políticas de SELECT adequadas para as tabelas usadas.

O Realtime também precisa estar habilitado para `public.leituras`.

## 5. Ajuste do tempo de offline

No `app.js` existe:

```js
ageMs(reading.data_hora) <= 3 * 60 * 1000
```

Isso considera o forno online se recebeu uma leitura nos últimos 3 minutos. Altere se o ThermoLink tiver outro intervalo de envio.
