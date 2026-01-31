import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { AlertTriangle, Clock, Coffee } from "lucide-react";

const BreakGauge = ({ 
  currentMinutes, 
  maxMinutes = 270, 
  label, 
  showWarning = true 
}) => {
  const { t } = useTranslation();
  const percentage = Math.min((currentMinutes / maxMinutes) * 100, 100);
  
  const getStatus = () => {
    if (percentage >= 90) return "danger";
    if (percentage >= 75) return "warning";
    return "safe";
  };
  
  const status = getStatus();
  const remaining = Math.max(0, maxMinutes - currentMinutes);
  
  const formatTime = (minutes) => {
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  };

  return (
    <div className="space-y-2" data-testid="break-gauge">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <div className="flex items-center gap-2">
          {status === "danger" && showWarning && (
            <AlertTriangle className="w-4 h-4 text-destructive animate-pulse" />
          )}
          {status === "warning" && showWarning && (
            <Coffee className="w-4 h-4 text-warning" />
          )}
          <span className={cn(
            "font-mono text-sm",
            status === "danger" && "text-destructive",
            status === "warning" && "text-warning",
            status === "safe" && "text-secondary"
          )}>
            {formatTime(currentMinutes)} / {formatTime(maxMinutes)}
          </span>
        </div>
      </div>
      
      <div className="break-gauge">
        <div 
          className={cn("break-gauge-fill", status)}
          style={{ width: `${percentage}%` }}
        />
      </div>
      
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{t("remaining")}: {formatTime(remaining)}</span>
        <span>{percentage.toFixed(0)}%</span>
      </div>
    </div>
  );
};

export const DrivingTimeCard = ({ 
  currentDriving, 
  currentWork, 
  maxDailyDriving = 540,
  maxDailyWork = 600 
}) => {
  const { t } = useTranslation();
  
  return (
    <div className="space-y-6 p-6 bg-card rounded-xl border border-border" data-testid="driving-time-card">
      <h3 className="font-heading text-lg font-semibold">{t("drivingTime")}</h3>
      
      <BreakGauge
        currentMinutes={currentDriving % 270}
        maxMinutes={270}
        label={t("breakRequired")}
      />
      
      <BreakGauge
        currentMinutes={currentDriving}
        maxMinutes={maxDailyDriving}
        label={t("dailyDriving")}
      />
      
      <BreakGauge
        currentMinutes={currentWork}
        maxMinutes={maxDailyWork}
        label={t("workTime")}
      />
    </div>
  );
};

export default BreakGauge;
