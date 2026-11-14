interface PanelProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  aside?: React.ReactNode;
}

/** Moldura padrão dos instrumentos. */
export function Panel({ title, children, className = '', aside }: PanelProps) {
  return (
    <section className={`flex flex-col rounded-2xl border border-line bg-surface p-4 sm:p-5 ${className}`}>
      <header className="mb-2 flex items-center justify-between gap-3">
        <h2 className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-muted">{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}
