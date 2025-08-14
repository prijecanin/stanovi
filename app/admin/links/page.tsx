// app/admin/links/page.tsx
"use client";

import { useEffect, useState } from "react";

type LinkRow = {
  id: string;
  slug: string;
  target_url: string;
  project_id: string | null;
  scope: "view" | "edit" | null;
  created_at: string | null;
};

export default function AdminLinksPage() {
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [auth, setAuth] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // --- Basic Auth helper: uzmi iz sessionStorage ili pitaj korisnika ---
  function ensureAuthHeader(force = false): string | null {
    if (!force) {
      const saved = sessionStorage.getItem("admin_basic_auth");
      if (saved) return saved;
    }
    const user = window.prompt("Admin korisničko ime:");
    if (user == null) return null;
    const pass = window.prompt("Admin lozinka:");
    if (pass == null) return null;
    const hdr = "Basic " + btoa(`${user}:${pass}`);
    sessionStorage.setItem("admin_basic_auth", hdr);
    return hdr;
  }

  // --- Fetch liste kratkih linkova ---
  async function fetchLinks(withAuth?: string | null) {
    const header = withAuth ?? auth ?? ensureAuthHeader();
    if (!header) {
      setError("Nisu uneseni admin kredencijali.");
      setLoading(false);
      return;
    }
    setAuth(header);
    setLoading(true);
    setError(null);

    const res = await fetch("/api/admin/links", {
      headers: { Authorization: header },
      cache: "no-store",
    });

    if (res.status === 401) {
      // krivi kredencijali: zatraži ponovo
      sessionStorage.removeItem("admin_basic_auth");
      const retry = ensureAuthHeader(true);
      if (!retry) {
        setError("Nisu uneseni admin kredencijali.");
        setLoading(false);
        return;
      }
      setAuth(retry);
      return fetchLinks(retry);
    }

    if (!res.ok) {
      setError(`Greška: ${res.status}`);
      setLoading(false);
      return;
    }

    const data = (await res.json()) as LinkRow[];
    setLinks(data);
    setLoading(false);
  }

  useEffect(() => {
    fetchLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Brisanje kratkog linka (s potvrdom + refetch) ---
  async function deleteLink(id: string) {
    if (!confirm("Obrisati ovaj kratki link?")) return;
    if (!auth) return;

    const res = await fetch(`/api/admin/delete-link?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Authorization: auth },
    });

    if (res.status === 401) {
      // istekao/krivi auth → pitaj i ponovi
      sessionStorage.removeItem("admin_basic_auth");
      const retry = ensureAuthHeader(true);
      if (!retry) {
        alert("Brisanje otkazano — nema kredencijala.");
        return;
      }
      setAuth(retry);
      return deleteLink(id);
    }

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(`Greška pri brisanju: ${j?.error || res.status}`);
      return;
    }

    // instant makni iz liste i napravi refetch da stanje bude 100% svježe
    setLinks(prev => prev.filter(l => l.id !== id));
    fetchLinks(auth);
  }

  if (loading) return <main className="p-4">Učitavanje…</main>;

  return (
    <main className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Kratki linkovi</h1>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-2 rounded-lg border"
            onClick={() => fetchLinks()}
            title="Osvježi listu"
          >
            Osvježi
          </button>
          <button
            className="px-3 py-2 rounded-lg border"
            onClick={() => {
              sessionStorage.removeItem("admin_basic_auth");
              const hdr = ensureAuthHeader(true);
              if (hdr) fetchLinks(hdr);
            }}
            title="Promijeni prijavu"
          >
            Promijeni prijavu
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 text-red-800 p-3">
          {error}
        </div>
      )}

      {links.length === 0 ? (
        <div className="text-gray-600">Nema kratkih linkova.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[720px]" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th className="text-left pr-3 py-2">ID</th>
                <th className="text-left pr-3 py-2">Slug</th>
                <th className="text-left pr-3 py-2">Target URL</th>
                <th className="text-left pr-3 py-2">Akcija</th>
              </tr>
            </thead>
            <tbody>
              {links.map((r) => (
                <tr key={r.id}>
                  <td className="align-top pr-3 py-1">{r.id}</td>
                  <td className="align-top pr-3 py-1">{r.slug}</td>
                  <td className="align-top pr-3 py-1 break-all">
                    <a href={r.target_url} target="_blank" className="underline">
                      {r.target_url}
                    </a>
                  </td>
                  <td className="align-top pr-3 py-1">
                    <button
                      className="px-3 py-1 rounded-md border bg-red-600 text-white hover:opacity-90"
                      onClick={() => deleteLink(r.id)}
                    >
                      Obriši
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
