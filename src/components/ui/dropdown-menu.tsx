import * as React from "react";
import { cn } from "@/lib/utils";

interface DropdownContextType {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const DropdownContext = React.createContext<DropdownContextType | null>(null);

export function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <DropdownContext.Provider value={{ open, setOpen }}>
      <div ref={ref} className="relative inline-block text-left">
        {children}
      </div>
    </DropdownContext.Provider>
  );
}

export function DropdownMenuTrigger({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const context = React.useContext(DropdownContext);
  if (!context) throw new Error("DropdownMenuTrigger must be used within DropdownMenu");

  return (
    <div
      onClick={() => context.setOpen((prev) => !prev)}
      className={cn("cursor-pointer", className)}
    >
      {children}
    </div>
  );
}

export function DropdownMenuContent({
  align = "end",
  className,
  children,
}: {
  align?: "start" | "end" | "center";
  className?: string;
  children: React.ReactNode;
}) {
  const context = React.useContext(DropdownContext);
  if (!context) throw new Error("DropdownMenuContent must be used within DropdownMenu");

  if (!context.open) return null;

  const alignClass =
    align === "end"
      ? "right-0"
      : align === "start"
      ? "left-0"
      : "left-1/2 -translate-x-1/2";

  return (
    <div
      className={cn(
        "absolute z-50 mt-1 min-w-[12rem] rounded-md border border-border-strong bg-elevated p-1 text-foreground shadow-lg animate-in fade-in-80",
        alignClass,
        className
      )}
    >
      {children}
    </div>
  );
}

export function DropdownMenuItem({
  onClick,
  className,
  children,
  destructive,
}: {
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
  destructive?: boolean;
}) {
  const context = React.useContext(DropdownContext);

  return (
    <div
      onClick={() => {
        onClick?.();
        context?.setOpen(false);
      }}
      className={cn(
        "relative flex cursor-pointer select-none items-center rounded px-2 py-1.5 text-xs outline-none transition-colors hover:bg-hover",
        destructive
          ? "text-negative hover:bg-negative/10 hover:text-negative"
          : "text-foreground",
        className
      )}
    >
      {children}
    </div>
  );
}

export function DropdownMenuSeparator() {
  return <div className="-mx-1 my-1 h-px bg-border-subtle" />;
}

export function DropdownMenuLabel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "px-2 py-1 text-[10px] font-semibold text-muted-foreground tracking-wider uppercase",
        className
      )}
    >
      {children}
    </div>
  );
}
