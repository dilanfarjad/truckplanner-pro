import { useTranslation } from "react-i18next";
import { Truck, Bus, Container, Car } from "lucide-react";
import { cn } from "@/lib/utils";

const vehicleIcons = {
  sattelzug: Truck,
  gliederzug: Container,
  solo_lkw: Car,
  omnibus: Bus,
};

const vehicleDefaults = {
  sattelzug: { height: 4.0, width: 2.55, length: 16.5, weight: 40000 },
  gliederzug: { height: 4.0, width: 2.55, length: 18.75, weight: 40000 },
  solo_lkw: { height: 3.5, width: 2.55, length: 10.0, weight: 7500 },
  omnibus: { height: 4.0, width: 2.55, length: 15.0, weight: 24000 },
};

const VehicleSelector = ({ vehicles, selectedId, onSelect }) => {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="vehicle-selector">
      {vehicles.map((vehicle) => {
        const Icon = vehicleIcons[vehicle.vehicle_type] || Truck;
        const isSelected = selectedId === vehicle.id;
        
        return (
          <button
            key={vehicle.id}
            onClick={() => onSelect(vehicle)}
            data-testid={`vehicle-btn-${vehicle.vehicle_type}`}
            className={cn(
              "vehicle-btn p-4",
              isSelected && "selected"
            )}
          >
            <Icon className={cn(
              "w-8 h-8 transition-colors",
              isSelected ? "text-primary" : "text-muted-foreground"
            )} />
            <span className={cn(
              "text-xs font-medium text-center leading-tight",
              isSelected ? "text-foreground" : "text-muted-foreground"
            )}>
              {t(vehicle.vehicle_type)}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {(vehicle.weight / 1000).toFixed(0)}t
            </span>
          </button>
        );
      })}
    </div>
  );
};

export const VehicleDetails = ({ vehicle }) => {
  const { t } = useTranslation();
  
  if (!vehicle) return null;
  
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-card/50 rounded-lg border border-border" data-testid="vehicle-details">
      <div>
        <p className="data-label">{t("height")}</p>
        <p className="data-value">{vehicle.height} {t("meters")}</p>
      </div>
      <div>
        <p className="data-label">{t("width")}</p>
        <p className="data-value">{vehicle.width} {t("meters")}</p>
      </div>
      <div>
        <p className="data-label">{t("length")}</p>
        <p className="data-value">{vehicle.length} {t("meters")}</p>
      </div>
      <div>
        <p className="data-label">{t("weight")}</p>
        <p className="data-value">{(vehicle.weight / 1000).toFixed(1)} {t("tonnes")}</p>
      </div>
    </div>
  );
};

export default VehicleSelector;
