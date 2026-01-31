import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth, API } from "@/App";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { 
  Clock, 
  Truck, 
  Coffee, 
  AlertTriangle, 
  TrendingUp,
  Calendar,
  Map
} from "lucide-react";
import { Link } from "react-router-dom";
import BreakGauge from "@/components/BreakGauge";

const Dashboard = () => {
  const { t } = useTranslation();
  const { user, token } = useAuth();
  const [summary, setSummary] = useState(null);
  const [todayLog, setTodayLog] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);

  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [summaryRes, logsRes, vehiclesRes] = await Promise.all([
        axios.get(`${API}/driving-logs/summary`, { headers }),
        axios.get(`${API}/driving-logs?days=1`, { headers }),
        axios.get(`${API}/vehicles`, { headers })
      ]);
      
      setSummary(summaryRes.data);
      setTodayLog(logsRes.data[0] || null);
      setVehicles(vehiclesRes.data);
    } catch (error) {
      toast.error(t("error"));
    } finally {
      setLoading(false);
    }
  };

  const formatMinutes = (minutes) => {
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hrs}h ${mins}m`;
  };

  const defaultVehicle = vehicles.find(v => v.is_default);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96" data-testid="dashboard-loading">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6" data-testid="dashboard">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl md:text-4xl font-bold tracking-tight">
            {t("dashboard")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t("welcomeBack")}, {user?.name}
          </p>
        </div>
        <Link to="/route-planner">
          <Button 
            size="lg" 
            className="h-14 px-8 text-lg font-semibold glow-primary"
            data-testid="start-route-btn"
          >
            <Map className="w-5 h-5 mr-2" />
            {t("planRoute")}
          </Button>
        </Link>
      </div>

      {/* Today's Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border-border" data-testid="today-driving-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("drivingTime")} {t("date")}
            </CardTitle>
            <Clock className="w-5 h-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="data-value text-primary">
              {formatMinutes(todayLog?.total_driving_minutes || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t("remaining")}: {formatMinutes(540 - (todayLog?.total_driving_minutes || 0))}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border" data-testid="today-work-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("workTime")} {t("date")}
            </CardTitle>
            <TrendingUp className="w-5 h-5 text-secondary" />
          </CardHeader>
          <CardContent>
            <div className="data-value text-secondary">
              {formatMinutes(todayLog?.total_work_minutes || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t("remaining")}: {formatMinutes(600 - (todayLog?.total_work_minutes || 0))}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border" data-testid="week-driving-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("weeklyDriving")}
            </CardTitle>
            <Calendar className="w-5 h-5 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="data-value text-warning">
              {formatMinutes(summary?.current_week_driving_minutes || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Max 56h (3360 min)
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border" data-testid="vehicle-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("vehicles")}
            </CardTitle>
            <Truck className="w-5 h-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">
              {defaultVehicle ? t(defaultVehicle.vehicle_type) : "-"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {defaultVehicle ? `${(defaultVehicle.weight / 1000).toFixed(0)}t` : t("noData")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Break Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card border-border" data-testid="break-status-card">
          <CardHeader>
            <CardTitle className="font-heading text-xl flex items-center gap-2">
              <Coffee className="w-5 h-5 text-primary" />
              {t("breakRequired")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <BreakGauge
              currentMinutes={(todayLog?.total_driving_minutes || 0) % 270}
              maxMinutes={270}
              label={`${t("drivingTime")} (4.5h Block)`}
            />
            
            <BreakGauge
              currentMinutes={todayLog?.total_driving_minutes || 0}
              maxMinutes={540}
              label={t("dailyDriving")}
            />
            
            <BreakGauge
              currentMinutes={todayLog?.total_work_minutes || 0}
              maxMinutes={600}
              label={t("workTime")}
            />

            {(todayLog?.total_driving_minutes || 0) % 270 > 200 && (
              <div className="flex items-center gap-3 p-4 bg-warning/10 border border-warning/30 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-warning flex-shrink-0" />
                <div>
                  <p className="font-medium text-warning">{t("warningBreakNeeded")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("remaining")}: {formatMinutes(270 - ((todayLog?.total_driving_minutes || 0) % 270))}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border" data-testid="weekly-overview-card">
          <CardHeader>
            <CardTitle className="font-heading text-xl">
              {t("twoWeekDriving")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("weeklyDriving")} (Aktuell)</span>
                <span className="font-mono">{formatMinutes(summary?.current_week_driving_minutes || 0)}</span>
              </div>
              <Progress 
                value={((summary?.current_week_driving_minutes || 0) / 3360) * 100} 
                className="h-3"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("weeklyDriving")} (Letzte)</span>
                <span className="font-mono">{formatMinutes(summary?.last_week_driving_minutes || 0)}</span>
              </div>
              <Progress 
                value={((summary?.last_week_driving_minutes || 0) / 3360) * 100} 
                className="h-3"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("twoWeekDriving")}</span>
                <span className="font-mono">{formatMinutes(summary?.two_week_total_minutes || 0)} / 90h</span>
              </div>
              <Progress 
                value={((summary?.two_week_total_minutes || 0) / 5400) * 100} 
                className="h-3"
              />
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
              <div className="text-center p-4 bg-secondary/10 rounded-lg">
                <p className="data-value text-secondary">
                  {formatMinutes(summary?.remaining_this_week_minutes || 0)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("remaining")} (Woche)
                </p>
              </div>
              <div className="text-center p-4 bg-primary/10 rounded-lg">
                <p className="data-value text-primary">
                  {formatMinutes(summary?.remaining_two_week_minutes || 0)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("remaining")} (2 Wochen)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link to="/route-planner" className="block">
          <Card className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer h-full">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                <Map className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">{t("routePlanner")}</h3>
                <p className="text-sm text-muted-foreground">{t("planRoute")}</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/driving-log" className="block">
          <Card className="bg-card border-border hover:border-secondary/50 transition-colors cursor-pointer h-full">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="w-12 h-12 rounded-xl bg-secondary/20 flex items-center justify-center">
                <Calendar className="w-6 h-6 text-secondary" />
              </div>
              <div>
                <h3 className="font-semibold">{t("drivingLog")}</h3>
                <p className="text-sm text-muted-foreground">{t("last56Days")}</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/vehicles" className="block">
          <Card className="bg-card border-border hover:border-warning/50 transition-colors cursor-pointer h-full">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="w-12 h-12 rounded-xl bg-warning/20 flex items-center justify-center">
                <Truck className="w-6 h-6 text-warning" />
              </div>
              <div>
                <h3 className="font-semibold">{t("vehicles")}</h3>
                <p className="text-sm text-muted-foreground">{vehicles.length} {t("vehicles")}</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
};

export default Dashboard;
