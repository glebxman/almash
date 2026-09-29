import {
  useEffect,
  useState,
  type FocusEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  Building2,
  Loader2,
  CircleUserRound,
  KeyRound,
  Smile,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { PasswordInput } from "@/components/PasswordInput";
import { LoginHero } from "@/components/LoginHero";
import { useNavigate } from "react-router-dom";
import {
  getTelegramInitData,
  isTelegramMiniApp,
  requestTelegramWidgetAuth,
} from "@/lib/telegram";
import { useTranslation } from "react-i18next";

// Pill fields; 16px text keeps iOS from zooming in on focus.
const INPUT =
  "h-14 w-full rounded-full border border-transparent bg-white pl-[3.75rem] pr-5 text-base font-semibold text-ink shadow-[0_8px_22px_-14px_rgba(14,14,18,0.35)] outline-none transition placeholder:font-medium placeholder:text-ink/35 focus:border-forest focus:ring-4 focus:ring-mist [&:-webkit-autofill]:shadow-[inset_0_0_0_100px_#fff] [&:-webkit-autofill]:[-webkit-text-fill-color:#17151F]";

export default function LoginPage() {
  const { user, login, register, loginTelegram, loading, telegram } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("Ташкент");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [telegramBusy, setTelegramBusy] = useState(false);
  const inMiniApp = isTelegramMiniApp();
  const canTelegram = inMiniApp || Boolean(telegram.botId);
  const isRegister = mode === "register";

  useEffect(() => {
    if (!loading && user) navigate("/", { replace: true });
  }, [user, loading, navigate]);

  const toggleMode = () => {
    setMode(isRegister ? "login" : "register");
    setError("");
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "register") {
        await register({ username, password, name, city });
      } else {
        await login(username, password);
      }
      navigate("/");
    } catch (e) {
      setError(explainAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  function explainAuthError(e: unknown): string {
    const err = e as Error & {
      status?: number;
      data?: { issues?: { path?: (string | number)[] }[] };
    };
    if (mode === "register") {
      if (err.status === 409) return t("login.errTaken");
      const field = err.data?.issues?.[0]?.path?.[0];
      if (field === "username") return t("login.usernameRule");
      if (field === "password") return t("login.passwordRule");
      if (field === "name") return t("login.errName");
      if (field === "city") return t("login.errCity");
    }
    return err instanceof Error ? err.message : t("login.error");
  }

  const onTelegram = async () => {
    setBusy(true);
    setTelegramBusy(true);
    setError("");
    try {
      const initData = getTelegramInitData();
      if (initData) {
        await loginTelegram({ initData });
      } else if (telegram.botId) {
        const widget = await requestTelegramWidgetAuth(telegram.botId);
        await loginTelegram({ telegramWidget: widget });
      } else {
        throw new Error(t("login.telegramNotConfigured"));
      }
      navigate("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("login.telegramError"));
    } finally {
      setBusy(false);
      setTelegramBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
      <LoginHero />

      {/* Bottom sheet: slides up over the hero's lower edge */}
      <div
        className="relative z-10 -mt-7 flex-1 rounded-t-[2rem] bg-[#F8F6F2] px-5 pb-[calc(1.75rem+var(--app-inset-bottom))] pt-3 shadow-[0_-14px_34px_-20px_rgba(14,14,18,0.35)] animate-rise"
        style={{ animationDelay: "90ms" }}
      >
        <span
          aria-hidden
          className="mx-auto mb-5 block h-1.5 w-11 rounded-full bg-ink/10"
        />
        <div className="text-center">
          <h2 className="font-['Poppins',Manrope,system-ui,sans-serif] text-[1.65rem] font-extrabold leading-tight tracking-[-0.03em] text-[#0E0E12]">
            {isRegister ? t("login.tabRegister") : t("login.tabLogin")}
          </h2>
          <p className="mt-1.5 text-sm font-medium text-ink/50">
            {t("login.tagline")}
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2.5 rounded-3xl bg-coral/10 px-4 py-3 text-sm font-semibold text-coral animate-rise"
          >
            <AlertCircle size={18} className="mt-px shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form
          className="mt-5 space-y-3"
          onSubmit={onSubmit}
          onFocus={keepFieldVisible}
        >
          {isRegister && (
            <div className="space-y-3 animate-rise">
              <Field icon={<Smile size={18} strokeWidth={2.2} />}>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  placeholder={t("login.name")}
                  aria-label={t("login.name")}
                  className={INPUT}
                />
              </Field>
              <Field icon={<Building2 size={18} strokeWidth={2.2} />}>
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  required
                  placeholder={t("login.city")}
                  aria-label={t("login.city")}
                  className={INPUT}
                />
              </Field>
            </div>
          )}

          <Field
            icon={<CircleUserRound size={18} strokeWidth={2.2} />}
            hint={isRegister ? t("login.usernameRule") : undefined}
          >
            <input
              value={username}
              onChange={(e) => {
                e.currentTarget.setCustomValidity("");
                setUsername(e.target.value);
              }}
              onInvalid={(e) => {
                if (mode === "register")
                  e.currentTarget.setCustomValidity(t("login.usernameRule"));
              }}
              required
              autoComplete="username"
              enterKeyHint="next"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder={t("login.username")}
              aria-label={t("login.username")}
              {...(mode === "register"
                ? { pattern: "[A-Za-z0-9_]{3,24}", maxLength: 24 }
                : {})}
              className={INPUT}
            />
          </Field>

          <Field
            icon={<KeyRound size={18} strokeWidth={2.2} />}
            hint={isRegister ? t("login.passwordRule") : undefined}
          >
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === "register" ? 8 : 1}
              autoComplete={
                mode === "register" ? "new-password" : "current-password"
              }
              placeholder={t("login.password")}
              enterKeyHint="go"
              aria-label={t("login.password")}
              className={`${INPUT} !pr-12`}
            />
          </Field>

          <button
            type="submit"
            disabled={busy}
            className="!mt-6 flex h-14 w-full items-center justify-center rounded-full bg-[#0E0E12] text-base font-bold text-white transition active:scale-[0.98] disabled:opacity-60"
          >
            {busy && !telegramBusy ? (
              <Loader2 size={22} className="animate-spin" />
            ) : isRegister ? (
              t("login.create")
            ) : (
              t("login.submit")
            )}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs font-semibold text-ink/35">
          <span className="h-px flex-1 bg-ink/10" />
          {t("login.or")}
          <span className="h-px flex-1 bg-ink/10" />
        </div>

        <button
          type="button"
          disabled={busy || !canTelegram}
          onClick={onTelegram}
          className="flex h-14 w-full items-center justify-center gap-2.5 rounded-full bg-white text-[15px] font-bold text-[#0E0E12] shadow-[0_8px_22px_-14px_rgba(14,14,18,0.35)] transition hover:shadow-[0_10px_26px_-14px_rgba(14,14,18,0.45)] active:scale-[0.98] disabled:opacity-55"
        >
          {telegramBusy ? (
            <Loader2 size={24} className="animate-spin text-[#229ED9]" />
          ) : (
            <TelegramLogo />
          )}
          {t("login.telegram")}
        </button>
        {!canTelegram && (
          <p className="mt-3 text-center text-xs font-semibold text-ink/45">
            {t("login.telegramSoon")}
          </p>
        )}

        <p className="mt-5 text-center text-sm font-medium text-ink/55">
          {isRegister ? t("login.haveAccount") : t("login.noAccount")}{" "}
          <button
            type="button"
            onClick={toggleMode}
            className="font-bold text-[#0E0E12] underline decoration-sand decoration-[3px] underline-offset-4"
          >
            {isRegister ? t("login.tabLogin") : t("login.tabRegister")}
          </button>
        </p>
      </div>
    </div>
  );
}

// In the Telegram WebView the keyboard can cover the lower fields; once it has
// opened, bring the focused input back to the middle of the screen.
function keepFieldVisible(event: FocusEvent<HTMLFormElement>) {
  const field = event.target;
  if (!(field instanceof HTMLInputElement)) return;
  window.setTimeout(
    () => field.scrollIntoView({ block: "center", behavior: "smooth" }),
    300,
  );
}

function Field({
  icon,
  hint,
  children,
}: {
  icon: ReactNode;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="group">
      <div className="relative">
        <span className="pointer-events-none absolute left-2 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-mist text-forest transition-colors duration-200 group-focus-within:bg-forest group-focus-within:text-white">
          {icon}
        </span>
        {children}
      </div>
      {hint && (
        <p className="mt-1.5 px-5 text-xs font-medium leading-snug text-ink/45">
          {hint}
        </p>
      )}
    </div>
  );
}

/** Official Telegram logo: white plane on the brand-blue gradient circle. */
function TelegramLogo() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden>
      <defs>
        <linearGradient id="tg-logo" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0" stopColor="#2AABEE" />
          <stop offset="1" stopColor="#229ED9" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="12" fill="url(#tg-logo)" />
      <path
        fill="#fff"
        d="M5.43 11.87c3.5-1.52 5.83-2.53 7-3.01 3.33-1.39 4.02-1.63 4.47-1.64.1 0 .32.02.47.14.12.1.15.23.17.33.02.09.04.3.02.47-.18 1.9-.96 6.5-1.36 8.63-.17.9-.5 1.2-.82 1.23-.7.06-1.23-.46-1.9-.9-1.06-.7-1.65-1.13-2.68-1.8-1.19-.79-.42-1.22.26-1.92.18-.19 3.25-2.98 3.31-3.23 0-.03.01-.15-.06-.21-.07-.06-.17-.04-.25-.02-.1.02-1.79 1.14-5.06 3.35-.48.33-.91.49-1.3.48-.43-.01-1.25-.24-1.87-.44-.75-.24-1.35-.37-1.3-.79.03-.22.33-.44.9-.66z"
      />
    </svg>
  );
}
