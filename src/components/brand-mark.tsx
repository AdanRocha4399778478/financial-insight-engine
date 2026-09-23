type BrandMarkProps = {
  className?: string;
  compact?: boolean;
};

export function BrandMark({ className = "", compact = false }: BrandMarkProps) {
  return (
    <div className={["flex items-center gap-3", className].filter(Boolean).join(" ")}>
      <img
        src="/brand/resultados-icon-light.svg"
        alt=""
        aria-hidden="true"
        className="h-9 w-9 shrink-0 object-contain dark:hidden"
      />
      <img
        src="/brand/resultados-icon-dark.svg"
        alt=""
        aria-hidden="true"
        className="hidden h-9 w-9 shrink-0 object-contain dark:block"
      />
      {!compact && (
        <span className="font-display text-lg font-semibold tracking-[0.04em] text-foreground">
          RESULTADOS S/A
        </span>
      )}
    </div>
  );
}
