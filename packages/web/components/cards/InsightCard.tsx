"use client";

interface Props {
  type: string;
  severity: string;
  title: string;
  description: string;
}

export default function InsightCard({ type, severity, title, description }: Props) {
  const severityStyles: Record<string, { bg: string; border: string; icon: string }> = {
    critical: { bg: "bg-red-950/30", border: "border-red-800/50", icon: "text-red-400" },
    warning: { bg: "bg-yellow-950/30", border: "border-yellow-800/50", icon: "text-yellow-400" },
    positive: { bg: "bg-green-950/30", border: "border-green-800/50", icon: "text-green-400" },
    info: { bg: "bg-blue-950/30", border: "border-blue-800/50", icon: "text-blue-400" },
  };

  const style = severityStyles[severity] || severityStyles.info;

  return (
    <div className={`${style.bg} border ${style.border} rounded-lg p-3.5`}>
      <div className={`text-sm font-semibold ${style.icon} mb-1`}>{title}</div>
      <div className="text-[0.78rem] text-text-secondary">{description}</div>
    </div>
  );
}
