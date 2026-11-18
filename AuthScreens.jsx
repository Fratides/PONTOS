import { useState } from "react";
import { ArrowRight, Eye, EyeOff, House, LoaderCircle, Mail } from "lucide-react";
import { supabase } from "./supabase.js";
import "./auth.css";

export function SplashScreen() {
  return (
    <main className="splash-screen" aria-label="Carregando Points">
      <div className="splash-glow" aria-hidden="true" />
      <div className="splash-brand">
        <House className="splash-house" size={35} strokeWidth={2.2} aria-hidden="true" />
        <span>Points</span>
      </div>
      <div className="splash-progress" role="progressbar" aria-label="Carregando">
        <span />
      </div>
    </main>
  );
}

export function LoadingScreen({ label = "Carregando..." }) {
  return (
    <main className="auth-loading">
      <LoaderCircle size={28} className="auth-spinner" aria-hidden="true" />
      <p>{label}</p>
    </main>
  );
}

export function AuthScreen({ configured, authError, themeToggle }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function submit(event) {
    event.preventDefault();
    if (!supabase || busy) return;

    setBusy(true);
    setMessage(null);
    try {
      const result =
        mode === "login"
          ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
          : await supabase.auth.signUp({ email: email.trim(), password });

      if (result.error) throw result.error;
      if (mode === "signup" && !result.data.session) {
        setMessage({
          type: "success",
          text: "Conta criada. Confira seu e-mail para confirmar o cadastro e depois entre.",
        });
      }
    } catch (error) {
      console.error("Não foi possível autenticar a conta.", error);
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Não foi possível concluir o acesso.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    if (!supabase || busy) return;

    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    } catch (error) {
      console.error("Não foi possível iniciar o acesso com Google.", error);
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Não foi possível iniciar o acesso com Google.",
      });
    } finally {
      setBusy(false);
    }
  }

  function changeMode(nextMode) {
    setMode(nextMode);
    setMessage(null);
  }

  return (
    <main className="auth-page">
      <div className="auth-background-glow" aria-hidden="true" />
      <div className="theme-toggle-floating">{themeToggle}</div>
      <div className="auth-content">
        <div className="auth-brand" aria-label="Points">
          <span className="auth-brand-icon">
            <House size={23} strokeWidth={2.3} aria-hidden="true" />
          </span>
          <span>Points</span>
        </div>

        <section className="auth-card" aria-labelledby="auth-title">
          <div className="auth-card-heading">
            <p className="auth-eyebrow">CONTROLE DE PONTOS</p>
            <h1 id="auth-title">
              {mode === "login" ? "Bem-vindo de volta" : "Crie sua conta"}
            </h1>
            <p>
              {mode === "login"
                ? "Entre para acompanhar seus pedidos e recebimentos."
                : "Cadastre-se para salvar seus pontos e pedidos na sua conta."}
            </p>
          </div>

          {!configured && (
            <div className="auth-message auth-message-error" role="alert">
              <strong>Falta configurar a conexão com o Supabase.</strong>
              <span>
                Adicione VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nas variáveis de ambiente da
                Vercel e execute o SQL de configuração do projeto.
              </span>
            </div>
          )}

          {(message || authError) && (
            <div
              className={`auth-message ${
                message?.type === "success" && !authError ? "auth-message-success" : "auth-message-error"
              }`}
              role={message?.type === "error" || authError ? "alert" : "status"}
            >
              {authError || message?.text}
            </div>
          )}

          <form className="auth-form" onSubmit={submit}>
            <label htmlFor="auth-email">E-mail</label>
            <div className="auth-input-wrap">
              <Mail size={18} aria-hidden="true" />
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={!configured || busy}
              />
            </div>

            <label htmlFor="auth-password">Senha</label>
            <div className="auth-input-wrap">
              <input
                id="auth-password"
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder="Mínimo de 6 caracteres"
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                disabled={!configured || busy}
              />
              <button
                className="auth-password-toggle"
                type="button"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                onClick={() => setShowPassword((current) => !current)}
                disabled={!configured || busy}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <button className="auth-submit" type="submit" disabled={!configured || busy}>
              {busy ? (
                <LoaderCircle className="auth-spinner" size={18} aria-hidden="true" />
              ) : (
                <>
                  {mode === "login" ? "Entrar" : "Criar conta"}
                  <ArrowRight size={17} aria-hidden="true" />
                </>
              )}
            </button>
          </form>

          <div className="auth-divider"><span>ou continue com</span></div>
          <button
            className="auth-google-button"
            type="button"
            onClick={signInWithGoogle}
            disabled={!configured || busy}
          >
            <svg viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.27 5.47-4.78 7.16l7.73 6c4.51-4.17 7.09-10.31 7.09-17.63z" />
              <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a23.97 23.97 0 0 0 0 21.56l7.98-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.81l-7.73-6c-2.15 1.44-4.91 2.3-8.17 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
            {mode === "login" ? "Entrar com Google" : "Cadastrar com Google"}
          </button>

          <p className="auth-switch">
            {mode === "login" ? "Ainda não tem uma conta?" : "Já tem uma conta?"}
            <button
              type="button"
              onClick={() => changeMode(mode === "login" ? "signup" : "login")}
            >
              {mode === "login" ? "Cadastre-se" : "Entrar"}
            </button>
          </p>
        </section>

        <p className="auth-footer">Seus dados ficam protegidos na sua conta.</p>
      </div>
    </main>
  );
}
