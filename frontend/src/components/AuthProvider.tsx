import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, type User } from "@/lib/client";
import { setAuthToken } from "@/lib/session";
import {
  ensureTelegramWriteAccess,
  bootTelegramWebApp,
  type TelegramAuthPayload,
} from "@/lib/telegram";

function deviceFingerprint() {
  if (typeof window === "undefined") return undefined;
  const key = "toyswap_fp";
  let fp = localStorage.getItem(key);
  if (!fp) {
    fp = `fp_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
    localStorage.setItem(key, fp);
  }
  return fp;
}

export type TelegramConfig = {
  enabled: boolean;
  botId: number | null;
  botUsername: string | null;
  demoHint: boolean;
};

type AuthResponse = {
  user: User | null;
  token?: string;
  telegram?: TelegramConfig;
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  telegram: TelegramConfig;
  refresh: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (input: {
    username: string;
    password: string;
    name: string;
    city: string;
  }) => Promise<void>;
  loginTelegram: (input: {
    initData?: string;
    telegramWidget?: TelegramAuthPayload;
  }) => Promise<void>;
  logout: () => Promise<void>;
};

const defaultTelegram: TelegramConfig = {
  enabled: false,
  botId: null,
  botUsername: null,
  demoHint: false,
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [telegram, setTelegram] = useState<TelegramConfig>(defaultTelegram);

  const refresh = useCallback(async () => {
    try {
      const data = await api<AuthResponse>("/api/auth");
      setUser(data.user);
      if (data.telegram) setTelegram(data.telegram);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    bootTelegramWebApp();
    let cancelled = false;
    (async () => {
      try {
        const data = await api<AuthResponse>("/api/auth");
        if (cancelled) return;
        setUser(data.user);
        if (data.telegram) setTelegram(data.telegram);
      } catch {
        if (!cancelled) setUser(null);
      }
      // No silent Telegram sign-in: without a session the Mini App shows the
      // login page first and the user taps "Войти через Telegram" themselves.
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyAuth = (data: AuthResponse) => {
    if (data.token) setAuthToken(data.token);
    setUser(data.user);
    if (data.telegram) setTelegram(data.telegram);
  };

  const login = async (username: string, password: string) => {
    const data = await api<AuthResponse>("/api/auth", {
      method: "POST",
      body: JSON.stringify({
        username,
        password,
        deviceFingerprint: deviceFingerprint(),
      }),
    });
    applyAuth(data);
  };

  const register = async (input: {
    username: string;
    password: string;
    name: string;
    city: string;
  }) => {
    const data = await api<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        ...input,
        deviceFingerprint: deviceFingerprint(),
      }),
    });
    applyAuth(data);
  };

  const loginTelegram = async (input: {
    initData?: string;
    telegramWidget?: TelegramAuthPayload;
  }) => {
    const data = await api<AuthResponse>("/api/auth", {
      method: "POST",
      body: JSON.stringify({
        ...input,
        deviceFingerprint: deviceFingerprint(),
      }),
    });
    applyAuth(data);
    // Inside the Mini App: let the bot send notifications (TZ §50)
    if (input.initData) void ensureTelegramWriteAccess();
  };

  const logout = async () => {
    try {
      await api("/api/auth", { method: "DELETE" });
    } finally {
      setAuthToken(null);
      setUser(null);
    }
  };

  return (
    <Ctx.Provider
      value={{
        user,
        loading,
        telegram,
        refresh,
        login,
        register,
        loginTelegram,
        logout,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}
