# Configuração do Supabase e Vercel

1. Crie um projeto no Supabase e habilite o provedor de e-mail em **Authentication > Providers**.
2. Em **Authentication > Providers > Google**, habilite o Google e configure no Google Cloud a URL de callback exibida pelo Supabase (normalmente `https://<project-ref>.supabase.co/auth/v1/callback`).
3. Em **Authentication > URL Configuration**, defina a URL do app e permita os endereços de retorno usados, como `http://localhost:5173`, `http://127.0.0.1:5173` e o domínio publicado na Vercel.
4. No **SQL Editor** do Supabase, execute o conteúdo de [`supabase/schema.sql`](./supabase/schema.sql). A tabela e as políticas RLS garantem que cada conta acesse somente os próprios dados.
5. Copie a URL do projeto e a chave pública (anon/publishable) em **Project Settings > API Keys**. Essa chave pública fica visível no app publicado; isso é esperado. A proteção dos dados depende das políticas RLS. Nunca use a chave `service_role`, chaves secretas ou o segredo OAuth do Google no navegador nem em variáveis com prefixo `VITE_`.
6. Na Vercel, adicione estas variáveis em **Settings > Environment Variables**, para os ambientes desejados:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
7. Faça um novo deploy para aplicar as variáveis. Para desenvolvimento local, copie `.env.example` para `.env.local` e preencha os mesmos valores.

O `.gitignore` exclui arquivos `.env*`, exceto este modelo `.env.example`. Não publique o `.env.local`; ele contém a configuração local.

O cadastro usa e-mail e senha do Supabase Auth. Se a confirmação de e-mail estiver habilitada, confirme a mensagem recebida antes de entrar.

No primeiro acesso de uma conta em um navegador, os dados antigos encontrados no armazenamento local são enviados para essa conta. Depois da confirmação de que o envio foi salvo no Supabase, a cópia local antiga é removida. Os novos dados são sincronizados na conta e podem ser acessados em outros dispositivos.
