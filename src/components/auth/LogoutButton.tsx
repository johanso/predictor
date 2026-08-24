"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** "Cambiar cuenta" and "cerrar sesión" are the same action here: drop the cookie. */
export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    await fetch("/api/session", { method: "DELETE" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className="label-eyebrow text-[0.6rem] text-ink-soft underline decoration-line underline-offset-2 transition-colors hover:text-pitch disabled:opacity-40"
    >
      Cambiar cuenta
    </button>
  );
}
