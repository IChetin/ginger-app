import { Eye, EyeOff } from "lucide-react";
import { forwardRef, useState, type InputHTMLAttributes } from "react";

import {
  passwordStrength,
  passwordStrengthLabel,
  type PasswordStrength,
} from "@/features/auth/lib/password";
import { cn } from "@/lib/utils";

const STRENGTH_CLASS: Record<PasswordStrength, string> = {
  weak: "bg-danger",
  medium: "bg-gold",
  strong: "bg-live",
};

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  showStrength?: boolean;
};

export const PasswordInput = forwardRef<HTMLInputElement, Props>(function PasswordInput(
  { className, showStrength = false, id, ...rest },
  ref,
) {
  const [visible, setVisible] = useState(false);
  const text = typeof rest.value === "string" ? rest.value : "";
  const level = passwordStrength(text);
  const bars = level === "weak" ? 1 : level === "medium" ? 2 : 3;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <input
          ref={ref}
          id={id}
          type={visible ? "text" : "password"}
          className={cn("tracker-input pr-11", className)}
          {...rest}
        />
        <button
          type="button"
          className="text-ink-3 hover:text-ink absolute top-1/2 right-3 -translate-y-1/2"
          aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
      {showStrength && text.length > 0 ? (
        <div className="flex items-center gap-2" data-testid="password-strength">
          <div className="flex flex-1 gap-1">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className={cn(
                  "h-1 flex-1 rounded-full",
                  n <= bars ? STRENGTH_CLASS[level] : "bg-surface-2",
                )}
              />
            ))}
          </div>
          <span className="text-ink-3 text-[12px] font-semibold">{passwordStrengthLabel(level)}</span>
        </div>
      ) : null}
    </div>
  );
});
