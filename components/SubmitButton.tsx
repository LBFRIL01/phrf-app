"use client";
import { useFormStatus } from "react-dom";

export function SubmitButton({ children, className, pendingText = "Saving…", confirm }: {
  children: React.ReactNode; className?: string; pendingText?: string; confirm?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className ?? "button"}
      disabled={pending}
      onClick={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}
    >
      {pending ? pendingText : children}
    </button>
  );
}
