// app/admin/links/page.tsx
"use client";

import { useEffect, useState } from "react";

export default function AdminLinksPage() {
  const [links, setLinks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Basic Auth — browser prompt
  const username = process.env.NEXT_PUBLIC_ADMIN_USER || "admin";
  const password = process.env.NEXT_PUBLIC_ADMIN_PASS || "pass123";
  const authHeader =
    "Basic " + btoa(`${username}:${password}`);

  // Fetch linkova
  async function fetchLinks() {
    setLoading(true);
    const res = await fetch("/api/admin/links", {
      headers: { Authorization: authHeader },
    });
    if (res.ok) {
      const data = await res.json();
      setLinks(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchLinks();
  }, []);

  // Brisanje linka
  async function deleteLink(id: string) {
    const res = await fetch(`/api/admin/delete-link?id=${id}`, {
      method: "DELETE",
      headers: { Authorization: authHeader },
    });
    if (res.ok) {
      setLinks((prev) => prev.filter((l) => l.id !== id));
    } else {
      alert("Greška pri brisanju linka.");
    }
  }

  if (loading) return <p>Učitavanje...</p>;

  return (
    <div style={{ padding: 20 }}>
      <h1>Kratki linkovi</h1>
      <table border={1} cellPadding={6} style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th>ID</th>
            <th>Slug</th>
            <th>Target URL</th>
            <th>Akcija</th>
          </tr>
        </thead>
        <tbody>
          {links.map((link) => (
            <tr key={link.id}>
              <td>{link.id}</td>
              <td>{link.slug}</td>
              <td>{link.target_url}</td>
              <td>
                <button onClick={() => deleteLink(link.id)}>Obriši</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
