import Link from "next/link";

export default function Page() {
  return (
    <main className="max-w-4xl mx-auto p-6 grid gap-6">
      <h1 className="text-2xl font-semibold">Konfigurator Strukture Stanova</h1>
      <p>Počni s izradom projekta.</p>
      <div>
        <Link href="/app/projects" className="inline-flex items-center px-4 py-2 rounded-xl bg-black text-white">Otvori aplikaciju</Link>
      </div>
    </main>
  );
}
