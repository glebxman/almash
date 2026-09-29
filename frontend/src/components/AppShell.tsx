import {
  Bell,
  Heart,
  Home,
  Layers,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Shield,
} from "lucide-react";
import clsx from "clsx";
import { useAuth } from "./AuthProvider";
import { mediaUrl } from "@/lib/env";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import header_logo from "../assets/header.svg";

const desktopLinks = [
  { href: "/", label: "nav.findTrade", icon: Search },
  { href: "/browse", label: "nav.catalog", icon: Layers },
  { href: "/items/new", label: "nav.add", icon: Plus },
  { href: "/trades", label: "nav.trades", icon: RefreshCw },
  { href: "/favorites", label: "nav.favorites", icon: Heart },
  { href: "/messages", label: "nav.messages", icon: MessageCircle },
  { href: "/matches", label: "nav.matches", icon: Home },
];

const mobileTabs = [
  { href: "/", label: "nav.find", icon: Search },
  { href: "/trades", label: "nav.trades", icon: RefreshCw },
  { href: "/items/new", label: "nav.add", icon: Plus, emphasize: true },
  { href: "/messages", label: "nav.chats", icon: MessageCircle },
  { href: "/browse", label: "nav.catalog", icon: Layers },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { t } = useTranslation();
  const swipeHome = pathname === "/";
  const hideTabBar = pathname === "/login";

  return (
    <div className="flex min-h-[100dvh] flex-col overflow-x-hidden">
      {/* The login page is chrome-free and full-bleed; it pads the safe areas itself. */}
      {hideTabBar ? null : (
        <header className="sticky top-0 z-40 bg-cream/80 pt-[var(--app-inset-top)] backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-3 sm:h-16 sm:px-4">
            <Link to="/" className="flex shrink-0 items-center gap-2">
              <img
                src={header_logo}
                alt="RETOY"
                className="h-12 w-12 shrink-0 object-contain sm:h-14 sm:w-14"
              />
            </Link>

            <nav className="hidden min-w-0 items-center gap-1 overflow-x-auto scrollbar-none lg:flex">
              {desktopLinks.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  to={href}
                  title={t(label)}
                  className={clsx(
                    "flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-2 text-[13px] font-bold transition",
                    isActive(pathname, href)
                      ? "bg-ink text-cream"
                      : "text-ink/60 hover:bg-white hover:text-ink",
                  )}
                >
                  <Icon size={16} />
                  <span className="hidden xl:inline">{t(label)}</span>
                </Link>
              ))}
              {user?.role === "ADMIN" && (
                <Link
                  to="/admin"
                  className={clsx(
                    "flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-2 text-[13px] font-bold transition",
                    pathname.startsWith("/admin")
                      ? "bg-coral text-white"
                      : "text-ink/60 hover:bg-coral/10",
                  )}
                >
                  <Shield size={16} />
                  <span className="hidden xl:inline">{t("nav.admin")}</span>
                </Link>
              )}
            </nav>

            <div className="flex items-center gap-1.5 sm:gap-2">
              {user && (
                <>
                  <Link
                    to="/favorites"
                    className={clsx(
                      "inline-flex h-10 w-10 items-center justify-center rounded-full transition lg:hidden",
                      isActive(pathname, "/favorites")
                        ? "bg-ink text-cream"
                        : "bg-white text-ink shadow-sm",
                    )}
                    aria-label={t("nav.favorites")}
                  >
                    <Heart size={18} />
                  </Link>
                  <Link
                    to="/notifications"
                    className={clsx(
                      "inline-flex h-10 w-10 items-center justify-center rounded-full transition",
                      isActive(pathname, "/notifications")
                        ? "bg-ink text-cream"
                        : "bg-white text-ink shadow-sm",
                    )}
                    aria-label={t("nav.notifications")}
                  >
                    <Bell size={18} />
                  </Link>
                </>
              )}
              {user ? (
                <Link
                  to="/profile"
                  title={t("nav.profile")}
                  aria-label={t("nav.profile")}
                  className="flex max-w-[40vw] items-center gap-2 rounded-full bg-white p-1 text-sm font-bold shadow-sm sm:pr-3 lg:pr-1"
                >
                  <img
                    src={
                      mediaUrl(user.avatarUrl) || "https://placehold.co/40x40"
                    }
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-full object-cover ring-2 ring-sand"
                  />
                  <span className="hidden truncate sm:inline lg:hidden">
                    {user.name}
                  </span>
                </Link>
              ) : (
                <Link
                  to="/login"
                  className="btn-3d btn-3d-ink btn-3d-sm inline-flex h-10 items-center rounded-full px-4 text-sm font-bold"
                >
                  {t("nav.login")}
                </Link>
              )}
            </div>
          </div>
        </header>
      )}

      <main
        className={clsx(
          "mx-auto w-full flex-1",
          hideTabBar
            ? "flex flex-col"
            : "px-3 pb-[calc(6.25rem+var(--app-inset-bottom))] pt-3 sm:px-4 sm:py-6 md:pb-8",
          swipeHome ? "max-w-lg" : "max-w-6xl",
        )}
      >
        {children}
      </main>

      {!hideTabBar && (
        <nav
          className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,var(--app-inset-bottom))] lg:hidden"
          aria-label={t("nav.mobileNav")}
        >
          <div className="mx-auto grid max-w-md grid-cols-5 rounded-[1.7rem] bg-ink p-1.5 text-cream shadow-[0_12px_40px_rgba(23,21,31,0.28)]">
            {mobileTabs.map(({ href, label, icon: Icon, emphasize }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  to={href}
                  className={clsx(
                    "nav-3d relative flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[10px] font-bold [-webkit-tap-highlight-color:transparent]",
                    active && !emphasize ? "text-sand" : "text-cream/45",
                  )}
                >
                  <span
                    className={clsx(
                      "flex items-center justify-center rounded-2xl",
                      (emphasize || active) && "btn-3d",
                      emphasize
                        ? "btn-3d-lime -mt-0.5 h-11 w-11 [--edge:#b8d63a] [--lift:4px]"
                        : active
                          ? "btn-3d-dark btn-3d-sm h-9 w-9"
                          : "nav-sink h-9 w-9",
                    )}
                  >
                    <Icon
                      size={emphasize ? 22 : 20}
                      strokeWidth={active ? 2.6 : 2}
                    />
                  </span>
                  <span className={clsx(emphasize && "text-sand")}>
                    {t(label)}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
