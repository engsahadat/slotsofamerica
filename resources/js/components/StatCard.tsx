import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  icon: ReactNode;
  className?: string;
  href?: string;
}

export function StatCard({ title, value, change, icon, className, href }: StatCardProps) {
  const navigate = useNavigate();

  return (
    <div
      onClick={href ? () => navigate(href) : undefined}
      className={cn(
        "group rounded-xl border border-border bg-card p-5 glow-card animate-slide-in transition-all duration-200",
        href && "cursor-pointer hover:border-primary/40 hover:shadow-[var(--shadow-glow)]",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted group-hover:bg-primary/10 transition-colors">
          {icon}
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between">
        <div>
          <p className="text-2xl font-bold font-display tracking-wide">{value}</p>
          {change && (
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="text-green-400">{change}</span> from last month
            </p>
          )}
        </div>
        {href && (
          <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
        )}
      </div>
    </div>
  );
}
