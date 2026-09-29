import i18n from "@/lib/i18n";
export type TelegramAuthPayload = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

type TelegramWebApp = {
  initData?: string;
  initDataUnsafe?: { user?: { allows_write_to_pm?: boolean } };
  ready: () => void;
  expand: () => void;
  requestWriteAccess?: (callback?: (granted: boolean) => void) => void;
};

type TelegramLogin = {
  auth: (
    options: { bot_id: number | string; request_access?: string; lang?: string },
    callback: (data: TelegramAuthPayload | false) => void,
  ) => void;
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
      Login?: TelegramLogin;
    };
  }
}

export function bootTelegramWebApp() {
  const webApp = window.Telegram?.WebApp;
  if (!webApp) return;
  try {
    webApp.ready();
    webApp.expand();
  } catch {
    // ignore missing Telegram runtime
  }
}

export function getTelegramInitData() {
  const initData = window.Telegram?.WebApp?.initData;
  return initData && initData.length > 0 ? initData : null;
}

export function isTelegramMiniApp() {
  return Boolean(getTelegramInitData());
}

function loadWidgetScript() {
  if (window.Telegram?.Login?.auth) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-telegram-login-widget]",
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("widget")), {
        once: true,
      });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.dataset.telegramLoginWidget = "1";
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error(i18n.t("errors.tgWidgetLoad")));
    document.head.appendChild(script);
  });
}

export async function requestTelegramWidgetAuth(botId: number) {
  await loadWidgetScript();
  const auth = window.Telegram?.Login?.auth;
  if (!auth) throw new Error(i18n.t("errors.tgLoginUnavailable"));
  return new Promise<TelegramAuthPayload>((resolve, reject) => {
    auth({ bot_id: botId, request_access: "write", lang: i18n.language }, (data) => {
      if (!data) {
        reject(new Error(i18n.t("errors.tgLoginCancelled")));
        return;
      }
      resolve(data);
    });
  });
}

/**
 * TZ §50: the bot can only message users who allowed it. Inside the Mini App
 * ask for that permission (Telegram shows its own confirmation) — returns
 * true/false, or null outside Telegram / on old clients.
 */
export function ensureTelegramWriteAccess(): Promise<boolean | null> {
  const webApp = window.Telegram?.WebApp;
  if (!webApp?.initData) return Promise.resolve(null);
  if (webApp.initDataUnsafe?.user?.allows_write_to_pm) return Promise.resolve(true);
  if (typeof webApp.requestWriteAccess !== "function") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      webApp.requestWriteAccess!((granted) => resolve(Boolean(granted)));
    } catch {
      resolve(null);
    }
  });
}
