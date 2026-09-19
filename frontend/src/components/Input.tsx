import type { InputHTMLAttributes } from "react";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded border border-rule bg-film px-3 py-2 text-sm text-ink outline-none focus:border-scan focus:ring-1 focus:ring-scan ${className}`}
      {...props}
    />
  );
}
