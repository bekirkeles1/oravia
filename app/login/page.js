"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  async function submitLogin(event) {
    event.preventDefault();
    setStatus("loading");
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = await response.json();

      if (!response.ok || payload.accepted !== true) {
        throw new Error(payload.reason || "Invalid username or password.");
      }

      setPassword("");
      router.replace("/");
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "Invalid username or password."
      );
      setStatus("idle");
      setPassword("");
    }
  }

  return (
    <main className="oravia-login-shell">
      <form className="oravia-login-form" onSubmit={submitLogin}>
        <h1>Oravia Login</h1>
        <label>
          Username or email
          <input
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label>
          Password
          <input
            autoComplete="current-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button type="submit" disabled={status === "loading"}>
          {status === "loading" ? "Signing in" : "Sign in"}
        </button>
        {error ? <p className="oravia-login-error">{error}</p> : null}
      </form>
    </main>
  );
}
