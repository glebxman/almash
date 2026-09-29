import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Classes for the input itself; right padding for the eye button is added here. */
  className?: string;
};

/**
 * Password field with a show/hide eye toggle. While hidden it switches to a
 * plain font: the brand font's bold bullet renders huge, and the font size itself
 * can't shrink below 16px on phones without triggering iOS focus zoom.
 */
export function PasswordInput({ className = "", ...props }: Props) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? "text" : "password"}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className={`w-full pr-12 ${className} ${
          visible || !props.value
            ? ""
            : "![font-family:Arial,Helvetica,sans-serif] !font-normal tracking-[0.18em]"
        }`}
      />
      <button
        type="button"
        // keep focus in the field so the phone keyboard doesn't close
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t("common.hidePassword") : t("common.showPassword")}
        aria-pressed={visible}
        className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-ink/40 transition hover:bg-ink/5 hover:text-ink/70 active:scale-90"
      >
        {visible ? <EyeOff size={19} /> : <Eye size={19} />}
      </button>
    </div>
  );
}
