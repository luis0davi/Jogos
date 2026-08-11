# Monitor de Fornos — protótipo

Protótipo web para monitoramento de temperatura de fornos de cerâmica, pensado para receber leituras de ESP8266.

## O que já existe

- Dashboard com múltiplos fornos
- Temperatura atual
- Meta de temperatura
- Status de operação
- Gráfico de evolução
- Histórico
- Alertas
- Cadastro de forno
- Configuração da API
- Modo protótipo com dados simulados
- Estrutura de integração com Google Sheets + Google Apps Script
- Exemplo de firmware ESP8266

## Testar agora

Abra `index.html` no navegador. Para publicar no GitHub Pages:

1. Crie um repositório no GitHub.
2. Envie `index.html`, `style.css` e `app.js`.
3. Em Settings > Pages, selecione a branch `main` e a pasta `/root`.
4. O GitHub fornecerá o endereço do site.

## Google Sheets

Crie uma planilha com uma aba chamada `leituras` e estes cabeçalhos:

`timestamp | id | nome | temperatura | meta | status | dispositivo`

Depois abra Extensões > Apps Script e cole `google-apps-script.gs`.

Publique como Web App. A URL `/exec` será usada pelo painel e pelo ESP8266.

## Arquitetura recomendada para o protótipo

ESP8266 → HTTP/HTTPS → Google Apps Script → Google Sheets
                                      ↓
                                Dashboard Web

Para produção, recomendo migrar de Google Sheets para um banco de dados real e usar MQTT ou WebSocket para atualização em tempo real.

## Próxima evolução

1. Definir exatamente o sensor de temperatura.
2. Definir quantos fornos e pontos de medição.
3. Implementar autenticação.
4. Implementar cadastro de dispositivos.
5. Criar histórico por ciclo.
6. Criar limites de temperatura e notificações.
7. Migrar o backend para Firebase/Supabase.
8. Transformar o painel em aplicativo Android/iOS com Flutter.
