import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth, API } from "@/App";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { 
  Truck, 
  Bus, 
  Container, 
  Car, 
  Plus, 
  Pencil, 
  Trash2,
  Star
} from "lucide-react";
import { cn } from "@/lib/utils";

const vehicleIcons = {
  sattelzug: Truck,
  gliederzug: Container,
  solo_lkw: Car,
  omnibus: Bus,
};

const defaultSpecs = {
  sattelzug: { height: 4.0, width: 2.55, length: 16.5, weight: 40000, axle_load: 11500 },
  gliederzug: { height: 4.0, width: 2.55, length: 18.75, weight: 40000, axle_load: 11500 },
  solo_lkw: { height: 3.5, width: 2.55, length: 10.0, weight: 7500, axle_load: 11500 },
  omnibus: { height: 4.0, width: 2.55, length: 15.0, weight: 24000, axle_load: 11500 },
};

const Vehicles = () => {
  const { t } = useTranslation();
  const { token } = useAuth();
  
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  
  const [formData, setFormData] = useState({
    name: "",
    vehicle_type: "sattelzug",
    height: 4.0,
    width: 2.55,
    length: 16.5,
    weight: 40000,
    axle_load: 11500,
    is_default: false
  });

  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetchVehicles();
  }, []);

  const fetchVehicles = async () => {
    try {
      const response = await axios.get(`${API}/vehicles`, { headers });
      setVehicles(response.data);
    } catch (error) {
      toast.error(t("error"));
    } finally {
      setLoading(false);
    }
  };

  const handleTypeChange = (type) => {
    const specs = defaultSpecs[type];
    setFormData({
      ...formData,
      vehicle_type: type,
      ...specs
    });
  };

  const openCreateDialog = () => {
    setEditingVehicle(null);
    setFormData({
      name: "",
      vehicle_type: "sattelzug",
      ...defaultSpecs.sattelzug,
      is_default: false
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (vehicle) => {
    setEditingVehicle(vehicle);
    setFormData({
      name: vehicle.name,
      vehicle_type: vehicle.vehicle_type,
      height: vehicle.height,
      width: vehicle.width,
      length: vehicle.length,
      weight: vehicle.weight,
      axle_load: vehicle.axle_load,
      is_default: vehicle.is_default
    });
    setIsDialogOpen(true);
  };

  const saveVehicle = async () => {
    try {
      if (editingVehicle) {
        await axios.put(`${API}/vehicles/${editingVehicle.id}`, formData, { headers });
        toast.success(t("success"));
      } else {
        await axios.post(`${API}/vehicles`, formData, { headers });
        toast.success(t("success"));
      }
      fetchVehicles();
      setIsDialogOpen(false);
    } catch (error) {
      toast.error(t("error"));
    }
  };

  const deleteVehicle = async (id) => {
    if (!window.confirm("Fahrzeug wirklich löschen?")) return;
    
    try {
      await axios.delete(`${API}/vehicles/${id}`, { headers });
      toast.success(t("success"));
      fetchVehicles();
    } catch (error) {
      toast.error(t("error"));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6" data-testid="vehicles-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl md:text-4xl font-bold tracking-tight">
            {t("vehicles")}
          </h1>
          <p className="text-muted-foreground mt-1">
            Fahrzeugprofile mit Maßen und Gewichten
          </p>
        </div>
        
        <Button 
          size="lg" 
          className="h-14 px-8"
          onClick={openCreateDialog}
          data-testid="add-vehicle-btn"
        >
          <Plus className="w-5 h-5 mr-2" />
          {t("add")} Fahrzeug
        </Button>
      </div>

      {/* Vehicle Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {vehicles.map((vehicle) => {
          const Icon = vehicleIcons[vehicle.vehicle_type] || Truck;
          
          return (
            <Card 
              key={vehicle.id}
              className={cn(
                "bg-card border-border relative overflow-hidden transition-all",
                vehicle.is_default && "border-primary ring-1 ring-primary/20"
              )}
              data-testid={`vehicle-card-${vehicle.id}`}
            >
              {vehicle.is_default && (
                <div className="absolute top-4 right-4">
                  <Star className="w-5 h-5 text-primary fill-primary" />
                </div>
              )}
              
              <CardHeader className="pb-4">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-14 h-14 rounded-xl flex items-center justify-center",
                    vehicle.is_default ? "bg-primary/20" : "bg-muted"
                  )}>
                    <Icon className={cn(
                      "w-8 h-8",
                      vehicle.is_default ? "text-primary" : "text-muted-foreground"
                    )} />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{vehicle.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {t(vehicle.vehicle_type)}
                    </p>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground uppercase">{t("height")}</p>
                    <p className="font-mono text-lg">{vehicle.height} m</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground uppercase">{t("width")}</p>
                    <p className="font-mono text-lg">{vehicle.width} m</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground uppercase">{t("length")}</p>
                    <p className="font-mono text-lg">{vehicle.length} m</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground uppercase">{t("weight")}</p>
                    <p className="font-mono text-lg">{(vehicle.weight / 1000).toFixed(1)} t</p>
                  </div>
                </div>

                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground uppercase">{t("axleLoad")}</p>
                  <p className="font-mono text-lg">{(vehicle.axle_load / 1000).toFixed(1)} t</p>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => openEditDialog(vehicle)}
                    data-testid={`edit-vehicle-${vehicle.id}`}
                  >
                    <Pencil className="w-4 h-4 mr-2" />
                    {t("edit")}
                  </Button>
                  <Button 
                    variant="outline" 
                    size="icon"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => deleteVehicle(vehicle.id)}
                    data-testid={`delete-vehicle-${vehicle.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingVehicle ? t("edit") : t("add")} Fahrzeug
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Vehicle Type Selector */}
            <div className="space-y-2">
              <Label>Fahrzeugtyp</Label>
              <div className="grid grid-cols-4 gap-2">
                {Object.entries(vehicleIcons).map(([type, Icon]) => (
                  <button
                    key={type}
                    onClick={() => handleTypeChange(type)}
                    className={cn(
                      "p-4 rounded-lg border-2 flex flex-col items-center gap-2 transition-all",
                      formData.vehicle_type === type
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-muted-foreground"
                    )}
                    data-testid={`type-btn-${type}`}
                  >
                    <Icon className={cn(
                      "w-8 h-8",
                      formData.vehicle_type === type ? "text-primary" : "text-muted-foreground"
                    )} />
                    <span className="text-xs font-medium">{t(type)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label>{t("name")}</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="z.B. Mein Sattelzug"
                data-testid="vehicle-name-input"
              />
            </div>

            {/* Dimensions */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t("height")} (m)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.height}
                  onChange={(e) => setFormData({ ...formData, height: parseFloat(e.target.value) || 0 })}
                  data-testid="vehicle-height-input"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("width")} (m)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.width}
                  onChange={(e) => setFormData({ ...formData, width: parseFloat(e.target.value) || 0 })}
                  data-testid="vehicle-width-input"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("length")} (m)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.length}
                  onChange={(e) => setFormData({ ...formData, length: parseFloat(e.target.value) || 0 })}
                  data-testid="vehicle-length-input"
                />
              </div>
            </div>

            {/* Weight */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("weight")} (kg)</Label>
                <Input
                  type="number"
                  value={formData.weight}
                  onChange={(e) => setFormData({ ...formData, weight: parseInt(e.target.value) || 0 })}
                  data-testid="vehicle-weight-input"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("axleLoad")} (kg)</Label>
                <Input
                  type="number"
                  value={formData.axle_load}
                  onChange={(e) => setFormData({ ...formData, axle_load: parseInt(e.target.value) || 0 })}
                  data-testid="vehicle-axle-input"
                />
              </div>
            </div>

            {/* Default Switch */}
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div>
                <p className="font-medium">Standard-Fahrzeug</p>
                <p className="text-sm text-muted-foreground">
                  Wird automatisch bei der Routenplanung verwendet
                </p>
              </div>
              <Switch
                checked={formData.is_default}
                onCheckedChange={(checked) => setFormData({ ...formData, is_default: checked })}
                data-testid="vehicle-default-switch"
              />
            </div>

            <Button 
              onClick={saveVehicle} 
              className="w-full h-12"
              data-testid="save-vehicle-btn"
            >
              {t("save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Vehicles;
