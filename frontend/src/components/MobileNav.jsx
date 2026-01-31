import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, 
  Map, 
  FileText, 
  Truck, 
  Users
} from "lucide-react";
import { cn } from "@/lib/utils";

const MobileNav = () => {
  const { t } = useTranslation();
  const location = useLocation();

  const navItems = [
    { path: "/dashboard", icon: LayoutDashboard, label: t("dashboard") },
    { path: "/route-planner", icon: Map, label: "Route" },
    { path: "/fleet", icon: Users, label: "Fleet" },
    { path: "/driving-log", icon: FileText, label: "Log" },
    { path: "/vehicles", icon: Truck, label: t("vehicles") },
  ];

  return (
    <nav 
      className="md:hidden fixed bottom-0 left-0 right-0 h-20 bg-background/95 backdrop-blur-lg border-t border-border flex justify-around items-center z-50"
      data-testid="mobile-nav"
    >
      {navItems.map((item) => {
        const isActive = location.pathname === item.path;
        const isFleet = item.path === "/fleet";
        return (
          <Link
            key={item.path}
            to={item.path}
            data-testid={`mobile-nav-${item.path.slice(1)}`}
            className={cn(
              "flex flex-col items-center justify-center gap-1 w-16 h-16 rounded-xl transition-all",
              isActive
                ? "text-primary"
                : isFleet 
                  ? "text-secondary"
                  : "text-muted-foreground"
            )}
          >
            <item.icon className={cn(
              "w-6 h-6", 
              isActive && "text-primary",
              isFleet && !isActive && "text-secondary"
            )} />
            <span className={cn(
              "text-[10px] font-medium truncate max-w-[60px]",
              isFleet && !isActive && "text-secondary"
            )}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
};

export default MobileNav;
