import { useState } from "react";
import { ArrowRight, Eye, EyeOff, House, LoaderCircle, Mail, User } from "lucide-react";
import { supabase } from "./supabase.js";
import "./auth.css";

function getAuthErrorMessage(error, action) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  const code = typeof error?.code === "string" ? error.code.toLowerCase() : "";
  const status = Number(error?.status);

  if (
    status === 429 ||
    code.includes("rate_limit") ||
    message.includes("rate limit") ||
    message.includes("too many requests")
  ) {
    return "O envio foi limitado temporariamente. Aguarde alguns minutos antes de tentar novamente.";
  }

  if (
    code.includes("email") && code.includes("send") ||
    /error sending .*email|failed to send .*email|smtp|email provider/.test(message)
  ) {
    return action === "signup"
      ? "O cadastro pode ter sido criado, mas o e-mail com o código não foi enviado. Confira a configuração SMTP no Supabase e tente reenviar o código."
      : "Não foi possível enviar o e-mail. Confira a configuração SMTP no Supabase e tente novamente.";
  }

  if (
    action === "verify" &&
    (code.includes("otp_expired") ||
      code.includes("otp_invalid") ||
      message.includes("token has expired") ||
      message.includes("invalid otp") ||
      message.includes("otp expired"))
  ) {
    return "Código inválido ou expirado. Confira o código ou solicite um novo.";
  }

  if (
    error instanceof TypeError ||
    message.includes("failed to fetch") ||
    message.includes("network")
  ) {
    return "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.";
  }

  if (action === "login" && code === "invalid_credentials") {
    return "E-mail ou senha incorretos.";
  }

  if (action === "resend") {
    return "Não foi possível reenviar o código. Confira o endereço de e-mail e tente novamente.";
  }

  if (action === "verify") {
    return "Não foi possível confirmar o código. Confira os números e tente novamente.";
  }

  if (action === "signup") {
    return "Não foi possível criar a conta. Verifique os dados e tente novamente.";
  }

  return "Não foi possível concluir o acesso. Tente novamente.";
}

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
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [awaitingVerification, setAwaitingVerification] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function submit(event) {
    event.preventDefault();
    if (!supabase || busy) return;

    if (awaitingVerification) {
      if (!/^\d{6}$/.test(verificationCode)) {
        setMessage({
          type: "error",
          text: "Digite o código de 6 números enviado para seu e-mail.",
        });
        return;
      }

      setBusy(true);
      setMessage(null);
      try {
        const { error } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: verificationCode,
          type: "signup",
        });
        if (error) throw error;
      } catch (error) {
        console.error("Não foi possível confirmar o cadastro.", error);
        setMessage({
          type: "error",
          text: getAuthErrorMessage(error, "verify"),
        });
      } finally {
        setBusy(false);
      }
      return;
    }

    if (mode === "signup" && (!firstName.trim() || !lastName.trim())) {
      setMessage({
        type: "error",
        text: "Informe seu nome e sobrenome.",
      });
      return;
    }

    if (mode === "signup" && password !== confirmPassword) {
      setMessage({
        type: "error",
        text: "As senhas não são iguais.",
      });
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const result =
        mode === "login"
          ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
          : await supabase.auth.signUp({
              email: email.trim(),
              password,
              options: {
                data: {
                  first_name: firstName.trim(),
                  last_name: lastName.trim(),
                  full_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
                },
              },
            });

      if (result.error) throw result.error;
      if (mode === "signup" && !result.data.session) {
        setAwaitingVerification(true);
        setMessage({
          type: "success",
          text: "Conta criada. Digite o código de 6 números enviado para seu e-mail.",
        });
      }
    } catch (error) {
      console.error("Não foi possível autenticar a conta.", error);
      const emailDeliveryFailure =
        mode === "signup" &&
        (/error sending .*email|failed to send .*email|smtp|email provider/i.test(
          error instanceof Error ? error.message : "",
        ) ||
          (typeof error?.code === "string" &&
            error.code.toLowerCase().includes("email") &&
            error.code.toLowerCase().includes("send")));
      if (emailDeliveryFailure) setAwaitingVerification(true);
      setMessage({
        type: "error",
        text: getAuthErrorMessage(error, mode === "login" ? "login" : "signup"),
      });
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    if (!supabase || busy) return;

    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
      });
      if (error) throw error;
      setMessage({
        type: "success",
        text: "Um novo código foi enviado para seu e-mail.",
      });
    } catch (error) {
      console.error("Não foi possível reenviar o código.", error);
      setMessage({
        type: "error",
        text: getAuthErrorMessage(error, "resend"),
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
    setAwaitingVerification(false);
    setVerificationCode("");
    setConfirmPassword("");
    setShowPassword(false);
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
              {awaitingVerification
                ? "Confirme seu e-mail"
                : mode === "login"
                  ? "Bem-vindo de volta"
                  : "Crie sua conta"}
            </h1>
            <p>
              {awaitingVerification
                ? "Use o código enviado para concluir o cadastro."
                : mode === "login"
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
            {awaitingVerification ? (
              <>
                <p className="auth-verification-email">
                  Enviamos um código de 6 números para <strong>{email}</strong>
                </p>
                <label htmlFor="auth-verification-code">Código de confirmação</label>
                <input
                  id="auth-verification-code"
                  className="auth-code-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  value={verificationCode}
                  onChange={(event) =>
                    setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  required
                  disabled={!configured || busy}
                />
              </>
            ) : (
              mode === "signup" && (
              <div className="auth-name-grid">
                <div>
                  <label htmlFor="auth-first-name">Nome</label>
                  <div className="auth-input-wrap">
                    <User size={18} aria-hidden="true" />
                    <input
                      id="auth-first-name"
                      type="text"
                      autoComplete="given-name"
                      placeholder="Nome"
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      required
                      disabled={!configured || busy}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="auth-last-name">Sobrenome</label>
                  <div className="auth-input-wrap">
                    <User size={18} aria-hidden="true" />
                    <input
                      id="auth-last-name"
                      type="text"
                      autoComplete="family-name"
                      placeholder="Sobrenome"
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                      required
                      disabled={!configured || busy}
                    />
                  </div>
                </div>
              </div>
              )
            )}

            {!awaitingVerification && (
              <>
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

            {mode === "signup" && (
              <>
                <label htmlFor="auth-confirm-password">Confirmar senha</label>
                <div className="auth-input-wrap">
                  <input
                    id="auth-confirm-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Digite a senha novamente"
                    minLength={6}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                    disabled={!configured || busy}
                  />
                  <button
                    className="auth-password-toggle"
                    type="button"
                    aria-label={showPassword ? "Ocultar senhas" : "Mostrar senhas"}
                    onClick={() => setShowPassword((current) => !current)}
                    disabled={!configured || busy}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </>
            )}
              </>
            )}

            <button className="auth-submit" type="submit" disabled={!configured || busy}>
              {busy ? (
                <LoaderCircle className="auth-spinner" size={18} aria-hidden="true" />
              ) : (
                <>
                  {awaitingVerification
                    ? "Confirmar código"
                    : mode === "login"
                      ? "Entrar"
                      : "Criar conta"}
                  <ArrowRight size={17} aria-hidden="true" />
                </>
              )}
            </button>
          </form>

          {awaitingVerification && (
            <div className="auth-resend">
              <button type="button" onClick={resendCode} disabled={!configured || busy}>
                Reenviar código
              </button>
              <button type="button" onClick={() => changeMode("login")} disabled={busy}>
                Voltar para entrar
              </button>
            </div>
          )}

          {!awaitingVerification && (
            <>
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
            </>
          )}

          {!awaitingVerification && (
          <p className="auth-switch">
            {mode === "login" ? "Ainda não tem uma conta?" : "Já tem uma conta?"}
            <button
              type="button"
              onClick={() => changeMode(mode === "login" ? "signup" : "login")}
            >
              {mode === "login" ? "Cadastre-se" : "Entrar"}
            </button>
          </p>
          )}
        </section>

        <p className="auth-footer">Seus dados ficam protegidos na sua conta.</p>
      </div>
    </main>
  );
}
