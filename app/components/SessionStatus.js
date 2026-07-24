"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SessionStatus({ user }) {
  const router = useRouter();
  const [status, setStatus] = useState("idle");

  if (!user) {
    return null;
  }

  async function logout() {
    setStatus("loading");

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <div className="session-status" aria-label="Current session">
      <span>{user.displayName || user.username}</span>
      <strong>{user.role}</strong>
      <button
        className="session-logout-button"
        type="button"
        onClick={logout}
        disabled={status === "loading"}
      >
        Logout
      </button>
    </div>
  );
}
