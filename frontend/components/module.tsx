interface ModuleProps {
  label: string;
  children: React.ReactNode;
  className?: string;
  /** Conteúdo alinhado à direita do rótulo (status, leitura secundária) */
  aside?: React.ReactNode;
}

/** Chapa do console que abriga cada instrumento, com rótulo gravado. */
export function Module({ label, children, className = '', aside }: ModuleProps) {
  return (
    <section className={`module flex flex-col ${className}`}>
      <header className="flex min-h-11 items-center justify-between gap-3 border-b border-line/70 px-5">
        <h2 className="engraved">{label}</h2>
        {aside}
      </header>
      <div className="flex flex-1 flex-col p-5">{children}</div>
    </section>
  );
}
