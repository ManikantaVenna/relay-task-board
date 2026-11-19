import type { ReactNode, SelectHTMLAttributes } from "react";
import { ChevronDown, LayoutGrid } from "lucide-react";
export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>
        relay<span className="brand-period">.</span>
      </span>
    </div>
  );
}
export function SelectField({
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="select-wrap">
      <select {...props}>{children}</select>
      <ChevronDown size={14} aria-hidden="true" />
    </span>
  );
}
export function Empty({
  children,
  icon = <LayoutGrid size={25} />,
}: {
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      {children}
    </div>
  );
}
