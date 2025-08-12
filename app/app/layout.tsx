export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-6xl mx-auto p-6 grid gap-6">
      {children}
    </div>
  );
}
