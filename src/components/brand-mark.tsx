type BrandMarkProps = {
  className?: string;
  variant?: "full" | "icon";
};

export function BrandMark({ className = "", variant = "full" }: BrandMarkProps) {
  const lightSrc =
    variant === "full"
      ? "/brand/resultados-full-light.png"
      : "/brand/resultados-icon-light.svg";
  const darkSrc =
    variant === "full"
      ? "/brand/resultados-full-dark.png"
      : "/brand/resultados-icon-dark.svg";

  return (
    <span
      role="img"
      aria-label="Resultados S/A"
      className={["inline-flex h-9 items-center", className].filter(Boolean).join(" ")}
    >
      <img
        src={lightSrc}
        alt=""
        aria-hidden="true"
        className="h-full w-auto object-contain dark:hidden"
      />
      <img
        src={darkSrc}
        alt=""
        aria-hidden="true"
        className="hidden h-full w-auto object-contain dark:block"
      />
    </span>
  );
}
