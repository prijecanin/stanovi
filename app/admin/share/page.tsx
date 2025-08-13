"use client";

import { useState } from "react";

export default function AdminSharePage() {
  const [projectId, setProjectId] = useState("");
  const [scope, setScope] = useState<"view"|"edit">("view");
  const [ttlSec, setTtlSec] = useState<number>(7 * 24 * 3600); // 7 dana
  const [result, setResult] = useState<{token?: string; link?: string; error?: string} | null>(null);
  const [loading, setLoading] = useState(false);

  async function generateLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setResult(null);
    try {
      const res = await fetch("/api/admin/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: projectId.trim(), scope, ttlSec }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Greška");
      setResult(json);
    } catch (e: any) {
      setResult({ error: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>Generiranje linka za klijenta</h1>

      <form onSubmit={generateLink} style={{ display: "grid", gap: 12, maxWidth: 520 }}>
        <label>
          <div style={{ fontSize: 12, color: "#555" }}>Project ID (isti onaj iz /s/[id])</div>
          <input
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            required
            placeholder="npr. 6b6c3f2a-...."
            style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 10 }}
          />
        </label>

        <label>
          <div style={{ fontSize: 12, color: "#555" }}>Ovlasti (scope)</div>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as "view"|"edit")}
            style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 10 }}
          >
            <option value="view">view (samo pregled)</option>
            <option value="edit">edit (može spremati/mijenjati)</option>
          </select>
        </label>

        <label>
          <div style={{ fontSize: 12, color: "#555" }}>Trajanje (TTL sekunde)</div>
          <input
            type="number"
            min={60}
            value={ttlSec}
            onChange={(e) => setTtlSec(Number(e.target.value) || 0)}
            style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 10 }}
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          style={{ padding: "10px 14px", borderRadius: 10, background: "#000", color: "#fff" }}
        >
          {loading ? "Generiram…" : "Generiraj link"}
        </button>
      </form>

      {result && (
        <div style={{ marginTop: 16, padding: 12, border: "1px solid #eee", borderRadius: 12 }}>
          {result.error ? (
            <div style={{ color: "#b91c1c" }}>Greška: {result.error}</div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: "#555" }}>Token</div>
              <div style={{ wordBreak: "break-all", fontFamily: "monospace", fontSize: 12, background: "#fafafa", padding: 8, borderRadius: 8 }}>
                {result.token}
              </div>
              <div style={{ height: 8 }} />
              <div style={{ fontSize: 12, color: "#555" }}>Link</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  readOnly
                  value={result.link || ""}
                  style={{ flex: 1, padding: "10px 12px", border: "1px solid #ddd", borderRadius: 10 }}
                />
                <button
                  onClick={() => { navigator.clipboard.writeText(result.link || ""); }}
                  style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd" }}
                >
                  Kopiraj
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </main>
  );
}
