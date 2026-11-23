import { useEffect, useState } from "react";
import { ArrowRight, Eye, EyeOff, House, LoaderCircle, Mail, Pencil, User } from "lucide-react";
import { supabase } from "./supabase.js";
import "./auth.css";

export const PENDING_REGISTRATION_STORAGE_KEY = "points-pending-verification-email";
export const REGISTRATION_COMPLETED_EVENT = "points-registration-completed";

function getPendingRegistration() {
  try {
    sessionStorage.removeItem("points-pending-signup-names");
    const storedRegistration = sessionStorage.getItem(PENDING_REGISTRATION_STORAGE_KEY);
    if (!storedRegistration) return { email: "", stage: "code" };

    try {
      const registration = JSON.parse(storedRegistration);
      if (typeof registration.email === "string") {
        return {
          email: registration.email.trim(),
          stage: registration.stage === "profile" ? "profile" : "code",
        };
      }
    } catch {
      return { email: storedRegistration.trim(), stage: "code" };
    }

    return { email: "", stage: "code" };
  } catch (error) {
    console.error("Não foi possível recuperar a verificação pendente.", error);
    return { email: "", stage: "code" };
  }
}

function savePendingRegistration(email, stage = "code") {
  try {
    sessionStorage.setItem(
      PENDING_REGISTRATION_STORAGE_KEY,
      JSON.stringify({ email: email.trim(), stage }),
    );
  } catch (error) {
    console.error("Não foi possível salvar a verificação pendente.", error);
  }
}

function clearPendingRegistration() {
  try {
    sessionStorage.removeItem(PENDING_REGISTRATION_STORAGE_KEY);
  } catch (error) {
    console.error("Não foi possível limpar a verificação pendente.", error);
  }
}

function isRateLimitError(error) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  const code = typeof error?.code === "string" ? error.code.toLowerCase() : "";
  const status = Number(error?.status);

  return (
    status === 429 ||
    code.includes("rate_limit") ||
    message.includes("rate limit") ||
    message.includes("too many requests")
  );
}

function getRateLimitWaitSeconds(error) {
  const message = error instanceof Error ? error.message : "";
  const match = message.match(/after\s+(\d+)\s+(seconds?|minutes?)/i);

  if (!match) return 60;
  return Number(match[1]) * (match[2].toLowerCase().startsWith("minute") ? 60 : 1);
}

function getAuthErrorMessage(error, action) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  const code = typeof error?.code === "string" ? error.code.toLowerCase() : "";

  if (isRateLimitError(error)) {
    return action === "resend"
      ? "Insira o código enviado anteriormente ou aguarde para reenviar um novo."
      : "O envio foi limitado temporariamente. Aguarde alguns minutos antes de tentar novamente.";
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

  if (action === "update") {
    return "O código foi confirmado, mas não foi possível salvar seus dados. Tente novamente.";
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
  const [storedRegistration] = useState(getPendingRegistration);
  const [mode, setMode] = useState("login");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState(storedRegistration.email);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [awaitingVerification, setAwaitingVerification] = useState(
    Boolean(storedRegistration.email) && storedRegistration.stage === "code",
  );
  const [awaitingAccountDetails, setAwaitingAccountDetails] = useState(
    Boolean(storedRegistration.email) && storedRegistration.stage === "profile",
  );
  const [needsSignupDetails, setNeedsSignupDetails] = useState(Boolean(storedRegistration.email));
  const [resendCooldownSeconds, setResendCooldownSeconds] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (resendCooldownSeconds <= 0) return undefined;

    const timer = window.setTimeout(
      () => setResendCooldownSeconds((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [resendCooldownSeconds]);

  async function finishSignup() {
    const { error } = await supabase.auth.updateUser({
      password,
      data: { full_name: `${firstName.trim()} ${lastName.trim()}`.trim() },
    });
    if (error) throw error;

    clearPendingRegistration();
    setAwaitingAccountDetails(false);
    setNeedsSignupDetails(false);
    window.dispatchEvent(new Event(REGISTRATION_COMPLETED_EVENT));
  }

  async function submit(event) {
    event.preventDefault();
    if (!supabase || busy) return;

    if (awaitingAccountDetails) {
      if (!firstName.trim() || !lastName.trim()) {
        setMessage({ type: "error", text: "Informe seu nome e sobrenome para concluir o cadastro." });
        return;
      }
      if (password.length < 6) {
        setMessage({ type: "error", text: "A senha deve ter pelo menos 6 caracteres." });
        return;
      }
      if (password !== confirmPassword) {
        setMessage({ type: "error", text: "As senhas não são iguais." });
        return;
      }

      setBusy(true);
      setMessage(null);
      try {
        await finishSignup();
      } catch (error) {
        console.error("Não foi possível salvar os dados do cadastro.", error);
        setMessage({ type: "error", text: getAuthErrorMessage(error, "update") });
      } finally {
        setBusy(false);
      }
      return;
    }

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
      let verificationSucceeded = false;
      try {
        const { error } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: verificationCode,
          type: "email",
        });
        if (error) throw error;
        verificationSucceeded = true;

        if (needsSignupDetails) {
          savePendingRegistration(email, "profile");
          setAwaitingVerification(false);
          setAwaitingAccountDetails(true);
          setVerificationCode("");
          setMessage({
            type: "success",
            text: "Código confirmado. Agora informe seu nome e senha para concluir o cadastro.",
          });
        } else {
          await finishSignup();
        }
      } catch (error) {
        if (verificationSucceeded) {
          savePendingRegistration(email, "profile");
          setAwaitingVerification(false);
          setAwaitingAccountDetails(true);
          setNeedsSignupDetails(true);
        }
        console.error(
          verificationSucceeded
            ? "O código foi confirmado, mas não foi possível salvar os dados do cadastro."
            : "Não foi possível confirmar o cadastro.",
          error,
        );
        setMessage({
          type: "error",
          text: getAuthErrorMessage(error, verificationSucceeded ? "update" : "verify"),
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
      if (mode === "signup") {
        const normalizedEmail = email.trim();
        savePendingRegistration(normalizedEmail);
        setAwaitingVerification(true);
        setNeedsSignupDetails(false);
        setAwaitingAccountDetails(false);

        const { error } = await supabase.auth.signInWithOtp({ email: normalizedEmail });
        if (error) throw error;

        setMessage({
          type: "success",
          text: "Digite o código de 6 dígitos enviado para seu e-mail para concluir o cadastro.",
        });
      } else {
        clearPendingRegistration();
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }
    } catch (error) {
      console.error("Não foi possível autenticar a conta.", error);
      const emailNotConfirmed =
        mode === "login" &&
        (error?.code === "email_not_confirmed" ||
          (error instanceof Error &&
            /email (is )?not confirmed/i.test(error.message)));

      if (emailNotConfirmed) {
        savePendingRegistration(email);
        setNeedsSignupDetails(true);
        setConfirmPassword(password);
        setVerificationCode("");
        setAwaitingVerification(true);
        try {
          const { error: resendError } = await supabase.auth.signInWithOtp({
            email: email.trim(),
          });
          if (resendError) throw resendError;
          setMessage({
            type: "success",
            text: "Seu e-mail ainda não foi confirmado. Um novo código foi enviado.",
          });
        } catch (resendError) {
          console.error("Não foi possível reenviar o código.", resendError);
          if (isRateLimitError(resendError)) {
            setResendCooldownSeconds(getRateLimitWaitSeconds(resendError));
          }
          setMessage({
            type: "error",
            text: getAuthErrorMessage(resendError, "resend"),
          });
        }
        return;
      }

      if (mode === "signup" && isRateLimitError(error)) {
        setResendCooldownSeconds(getRateLimitWaitSeconds(error));
      }
      setMessage({
        type: "error",
        text: getAuthErrorMessage(
          error,
          mode === "login" ? "login" : isRateLimitError(error) ? "resend" : "signup",
        ),
      });
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    if (!supabase || busy) return;

    if (!email.trim()) {
      setMessage({
        type: "error",
        text: "Informe o e-mail usado no cadastro para reenviar o código.",
      });
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      savePendingRegistration(email);
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });
      if (error) throw error;
      setResendCooldownSeconds(0);
      setVerificationCode("");
      setAwaitingVerification(true);
      setMessage({
        type: "success",
        text: "Código enviado. Digite os 6 dígitos para concluir o cadastro.",
      });
    } catch (error) {
      console.error("Não foi possível reenviar o código.", error);
      if (isRateLimitError(error)) {
        setResendCooldownSeconds(getRateLimitWaitSeconds(error));
      }
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

    const pendingRegistration = getPendingRegistration();
    clearPendingRegistration();
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
      if (pendingRegistration.email) {
        savePendingRegistration(pendingRegistration.email, pendingRegistration.stage);
      }
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

  function changeVerificationEmail() {
    setMode("signup");
    setAwaitingVerification(false);
    setAwaitingAccountDetails(false);
    setVerificationCode("");
    setConfirmPassword(password);
    setResendCooldownSeconds(0);
    setShowPassword(false);
    setMessage(null);
  }

  const showSignupDetails =
    (!awaitingVerification && mode === "signup") ||
    awaitingAccountDetails;
  const showPasswordFields = !awaitingVerification || awaitingAccountDetails;
  const showConfirmPassword = mode === "signup" || awaitingAccountDetails;

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
              {awaitingAccountDetails
                ? "Finalize seu cadastro"
                : awaitingVerification
                  ? "Confirme seu e-mail"
                : mode === "login"
                  ? "Bem-vindo de volta"
                  : "Crie sua conta"}
            </h1>
            <p>
              {awaitingAccountDetails
                ? "Seu e-mail foi confirmado. Complete os dados para ativar sua conta."
                : awaitingVerification
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
            {awaitingAccountDetails && (
              <p className="auth-verification-email">
                E-mail confirmado: <strong>{email}</strong>
              </p>
            )}

            {awaitingVerification && (
              <>
                <div className="auth-verification-email-row">
                  <p className="auth-verification-email">
                    Enviamos um código de 6 números para <strong>{email}</strong>
                  </p>
                  <button
                    className="auth-change-email-button"
                    type="button"
                    onClick={changeVerificationEmail}
                    disabled={busy}
                    aria-label="Alterar e-mail"
                    title="Alterar e-mail"
                  >
                    <Pencil size={15} aria-hidden="true" />
                  </button>
                </div>
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
                {needsSignupDetails && (
                  <p className="auth-verification-email">
                    Para concluir o cadastro após a retomada, confirme o código e depois informe seu nome e senha.
                  </p>
                )}
              </>
            )}

            {showSignupDetails && (
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
            )}

            {!awaitingVerification && !awaitingAccountDetails && (
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
              </>
            )}

            {showPasswordFields && (
              <>
                <label htmlFor="auth-password">Senha</label>
                <div className="auth-input-wrap">
                  <input
                    id="auth-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={mode === "login" && !awaitingVerification ? "current-password" : "new-password"}
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

                {showConfirmPassword && (
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
                    : awaitingAccountDetails
                      ? "Finalizar cadastro"
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
              <div className="auth-resend-action">
                <button
                  type="button"
                  onClick={resendCode}
                  disabled={!configured || busy || resendCooldownSeconds > 0}
                >
                  Reenviar código
                </button>
                {resendCooldownSeconds > 0 && (
                  <span className="auth-resend-countdown" aria-live="polite">
                    {String(Math.floor(resendCooldownSeconds / 60)).padStart(2, "0")}:
                    {String(resendCooldownSeconds % 60).padStart(2, "0")}
                  </span>
                )}
              </div>
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

          {!awaitingVerification && !awaitingAccountDetails && (
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
