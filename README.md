# Monitor Fornos — teste

1. Abra `js/supabase.js`.
2. Coloque a URL e a chave pública do Supabase.
3. No Supabase Authentication > Users, crie um usuário com e-mail e senha.
4. No usuário, configure `app_metadata` com:
   {"empresa_id": 1}
   (troque 1 pelo ID da empresa).
5. Publique esta pasta no GitHub Pages.
6. Abra `login.html`, entre e o painel buscará somente a empresa indicada.

Estrutura usada conforme suas fotos:
empresas -> Órfãos (dispositivos) -> fornos -> leituras.

ONLINE: leitura recebida nos últimos 60 segundos.
ALARME DE TESTE: canal 1 ou canal 2 >= 900 °C.

IMPORTANTE: nunca coloque service_role key no GitHub.
Para produção, mantenha RLS ativo e ajuste as políticas conforme sua estrutura.
