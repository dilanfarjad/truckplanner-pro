import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, 
  Map, 
  FileText, 
  Truck, 
  Settings,
  LogOut,
  Users
} from "lucide-react";
import { useAuth } from "@/App";
import { cn } from "@/lib/utils";
import NotificationBell from "@/components/NotificationBell";

const Sidebar = () => {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const location = useLocation();

  const navItems = [
    { path: "/dashboard", icon: LayoutDashboard, label: t("dashboard") },
    { path: "/route-planner", icon: Map, label: t("routePlanner") },
    { path: "/driving-log", icon: FileText, label: t("drivingLog") },
    { path: "/vehicles", icon: Truck, label: t("vehicles") },
    { path: "/settings", icon: Settings, label: t("settings") },
  ];

  return (
    <aside 
      className="hidden md:flex flex-col w-64 border-r border-border h-screen fixed top-0 left-0 bg-card z-40"
      data-testid="sidebar"
    >
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <Link to="/dashboard" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Truck className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="font-heading text-xl font-bold tracking-tight text-foreground">
              {t("appName")}
            </h1>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              {t("appSubtitle")}
            </p>
          </div>
        </Link>
      </div>
      
      {/* Fleet Manager Button - PROMINENT for all users */}
      <div className="px-4 pt-4">
        <Link
          to="/fleet"
          data-testid="nav-fleet-manager-prominent"
          className={cn(
            "flex items-center gap-3 px-4 py-4 rounded-xl text-base font-semibold transition-all border-2",
            location.pathname === "/fleet"
              ? "bg-secondary text-secondary-foreground border-secondary"
              : "bg-secondary/10 text-secondary border-secondary/30 hover:bg-secondary/20 hover:border-secondary/50"
          )}
        >
          <Users className="w-6 h-6" />
          <div>
            <span className="block">Fleet Manager</span>
            <span className="text-xs font-normal opacity-75">
              {user?.role === "manager" ? "Flotten-Übersicht" : "Fahrer-Status"}
            </span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              data-testid={`nav-${item.path.slice(1)}`}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-all",
                isActive
                  ? "bg-primary/10 text-primary border-l-2 border-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User Section */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-secondary/20 flex items-center justify-center">
              <span className="text-secondary font-semibold">
                {user?.name?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {user?.role === "manager" ? "Flottenmanager" : "Fahrer"}
              </p>
            </div>
          </div>
          <NotificationBell />
        </div>
        <button
          onClick={logout}
          data-testid="logout-btn"
          className="flex items-center gap-3 w-full px-4 py-3 mt-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          {t("logout")}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
