// app/admin/share/AdminShareClient.tsx  (CLIENT component)
"use client";

import { useFormState } from "react-dom";
type Action = (state: any, formData: FormData) => Promise<{ token?: string; link?: string; error?: string }>;

export default function AdminShareClient({ action }: { action: Action }) {
  const [state, formAction] = useFormState(action, {});

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>Generiranje linka za klijenta</h1>

      <form action={formAction} style={{ display: "grid", gap: 12, maxWidth: 520 }}>
        <label>
          <div style={{ fontSize: 12, color: "#555" }}>Project ID (isti onaj iz /s/[id])</div>
          <input
            name="projectId"
            required
            placeholder="npr. a7dd2fd3-...."
            style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 10 }}
          />
        </label>

        <label>
          <div style={{ fontSize: 12, color: "#555" }}>Ovlasti (scope)</div>
          <select name="scope" defaultValue="view" style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 10 }}>
            <option value="view">view (samo pregled)</option>
            <option value="edit">edit (može spremati/mijenjati)</option>
          </select>
        </label>

        <label>
          <div style={{ fontSize: 12, color: "#555" }}>Trajanje (TTL sekunde)</div>
          <input
            name="ttlSec"
            type="number"
            min={60}
            defaultValue={7 * 24 * 3600}
            style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 10 }}
          />
        </label>

        <button type="submit" style={{ padding: "10px 14px", borderRadius: 10, background: "#000", color: "#fff" }}>
          Generiraj link
        </button>
      </form>

      {state?.error && (
        <div style={{ marginTop: 16, color: "#b91c1c" }}>Greška: {state.error}</div>
      )}

      {state?.link && (
        <div style={{ marginTop: 16, padding: 12, border: "1px solid #eee", borderRadius: 12 }}>
          <div style={{ fontSize: 12, color: "#555" }}>Token</div>
          <div style={{ wordBreak: "break-all", fontFamily: "monospace", fontSize: 12, background: "#fafafa", padding: 8, borderRadius: 8 }}>
            {state.token}
          </div>
          <div style={{ height: 8 }} />
          <div style={{ fontSize: 12, color: "#555" }}>Link</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              readOnly
              value={state.link}
              style={{ flex: 1, padding: "10px 12px", border: "1px solid #ddd", borderRadius: 10 }}
            />
            <button
              type="button"
              onClick={() => state.link && navigator.clipboard.writeText(state.link)}
              style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd" }}
            >
              Kopiraj
            </button>
          </div>
          <div style={{ marginTop: 8 }}>
            <a href={state.link} target="_blank" rel="noreferrer" style={{ fontSize: 14, textDecoration: "underline" }}>
              Otvori link u novom tabu
            </a>
          </div>
        </div>
      )}
    </main>
  );
}
