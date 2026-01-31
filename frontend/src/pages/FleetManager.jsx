import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuth, API } from "@/App";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { 
  Users, 
  Truck, 
  MapPin,
  Clock,
  AlertTriangle,
  Plus,
  RefreshCw,
  Building2,
  UserPlus,
  Map,
  Euro,
  Fuel,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Activity,
  Calendar
} from "lucide-react";
import RouteMap from "@/components/RouteMap";

const FleetManager = () => {
  const { t, i18n } = useTranslation();
  const { user, token } = useAuth();
  
  const [activeTab, setActiveTab] = useState("live-map");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Data states
  const [liveMapData, setLiveMapData] = useState(null);
  const [driverOverview, setDriverOverview] = useState(null);
  const [costOverview, setCostOverview] = useState(null);
  const [costPeriod, setCostPeriod] = useState("week");
  
  // Fleet management
  const [isCreateFleetOpen, setIsCreateFleetOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [fleetForm, setFleetForm] = useState({ name: "", company: "" });
  const [inviteEmail, setInviteEmail] = useState("");

  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    if (user?.role === "manager" || user?.role === "driver") {
      fetchAllData();
    }
  }, [user]);

  useEffect(() => {
    if (activeTab === "costs") {
      fetchCostData();
    }
  }, [costPeriod]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchLiveMap(),
        fetchDriverOverview(),
        fetchCostData()
      ]);
    } catch (error) {
      console.error("Fleet data error:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLiveMap = async () => {
    try {
      const response = await axios.get(`${API}/fleet/live-map`, { headers });
      setLiveMapData(response.data);
    } catch (error) {
      if (error.response?.status !== 403) {
        console.error("Live map error:", error);
      }
    }
  };

  const fetchDriverOverview = async () => {
    try {
      const response = await axios.get(`${API}/fleet/driver-overview`, { headers });
      setDriverOverview(response.data);
    } catch (error) {
      if (error.response?.status !== 403) {
        console.error("Driver overview error:", error);
      }
    }
  };

  const fetchCostData = async () => {
    try {
      const response = await axios.get(`${API}/fleet/cost-overview?period=${costPeriod}`, { headers });
      setCostOverview(response.data);
    } catch (error) {
      if (error.response?.status !== 403) {
        console.error("Cost overview error:", error);
      }
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    await fetchAllData();
    setRefreshing(false);
    toast.success("Daten aktualisiert");
  };

  const createFleet = async () => {
    try {
      await axios.post(`${API}/fleet/create`, fleetForm, { headers });
      toast.success("Flotte erstellt");
      setIsCreateFleetOpen(false);
      fetchAllData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Fehler");
    }
  };

  const inviteDriver = async () => {
    if (!inviteEmail) return;
    try {
      await axios.post(`${API}/fleet/invite`, {
        email: inviteEmail,
        fleet_id: user.fleet_id
      }, { headers });
      toast.success("Fahrer eingeladen");
      setIsInviteOpen(false);
      setInviteEmail("");
      fetchAllData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Fehler");
    }
  };

  const formatMinutes = (minutes) => {
    const hrs = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hrs}h ${mins}m`;
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "driving":
        return <Badge className="bg-green-500">Fährt</Badge>;
      case "online":
      case "parked":
        return <Badge className="bg-blue-500">Online</Badge>;
      default:
        return <Badge variant="outline">Offline</Badge>;
    }
  };

  const getComplianceBadge = (compliance) => {
    switch (compliance) {
      case "green":
        return <Badge className="bg-green-500"><CheckCircle2 className="w-3 h-3 mr-1" />OK</Badge>;
      case "yellow":
        return <Badge className="bg-yellow-500"><AlertTriangle className="w-3 h-3 mr-1" />Warnung</Badge>;
      case "red":
        return <Badge className="bg-red-500"><XCircle className="w-3 h-3 mr-1" />Kritisch</Badge>;
      default:
        return <Badge variant="outline">Unbekannt</Badge>;
    }
  };

  // Check if user has access
  if (user?.role !== "manager" && user?.role !== "driver") {
    return (
      <div className="p-4 md:p-6 lg:p-8">
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center">
            <Building2 className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Flottenmanager-Bereich</h2>
            <p className="text-muted-foreground">
              Bitte melden Sie sich an, um die Flottenübersicht zu sehen.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6" data-testid="fleet-manager">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl md:text-4xl font-bold tracking-tight">
            Fleet Manager
          </h1>
          <p className="text-muted-foreground mt-1">
            Live-Übersicht Ihrer Flotte
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={refreshData}
            disabled={refreshing}
            data-testid="refresh-fleet-btn"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Aktualisieren
          </Button>
          
          {user?.role === "manager" && (
            <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
              <DialogTrigger asChild>
                <Button data-testid="invite-driver-btn">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Fahrer einladen
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Fahrer einladen</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>E-Mail des Fahrers</Label>
                    <Input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="fahrer@example.com"
                    />
                  </div>
                  <Button onClick={inviteDriver} className="w-full">
                    Einladen
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Fahrzeuge</p>
                <p className="text-2xl font-bold">{liveMapData?.total || 0}</p>
              </div>
              <Truck className="w-8 h-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Online</p>
                <p className="text-2xl font-bold text-green-500">{liveMapData?.online || 0}</p>
              </div>
              <Activity className="w-8 h-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Fahrend</p>
                <p className="text-2xl font-bold text-blue-500">{liveMapData?.driving || 0}</p>
              </div>
              <MapPin className="w-8 h-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Warnungen</p>
                <p className="text-2xl font-bold text-red-500">
                  {driverOverview?.summary?.critical || 0}
                </p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="live-map" className="flex items-center gap-2">
            <Map className="w-4 h-4" />
            Live-Karte
          </TabsTrigger>
          <TabsTrigger value="drivers" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Fahrer
          </TabsTrigger>
          <TabsTrigger value="costs" className="flex items-center gap-2">
            <Euro className="w-4 h-4" />
            Kosten
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Live Map */}
        <TabsContent value="live-map" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Map */}
            <Card className="lg:col-span-2 bg-card border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Map className="w-5 h-5 text-primary" />
                  Live-Positionen
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[500px] rounded-lg overflow-hidden">
                  <RouteMap
                    restStops={liveMapData?.vehicles?.filter(v => v.location?.lat)?.map(v => ({
                      lat: v.location.lat,
                      lon: v.location.lon,
                      name: `${v.driver_name} - ${v.vehicle.name}`,
                      type: v.status === "driving" ? "driver_active" : "driver"
                    })) || []}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Vehicle List */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="w-5 h-5 text-primary" />
                  Fahrzeuge
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-3">
                    {liveMapData?.vehicles?.map((vehicle) => (
                      <div 
                        key={vehicle.driver_id}
                        className={`p-4 rounded-lg border ${
                          vehicle.status === "driving" 
                            ? "border-green-500/30 bg-green-500/5" 
                            : vehicle.status === "offline"
                            ? "border-gray-500/30 bg-gray-500/5"
                            : "border-blue-500/30 bg-blue-500/5"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold">{vehicle.driver_name}</span>
                          {getStatusBadge(vehicle.status)}
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          {vehicle.vehicle.name}
                        </p>
                        <div className="flex justify-between text-xs">
                          <span>Heute: {formatMinutes(vehicle.today.driving_minutes)}</span>
                          <span className="text-green-500">
                            Rest: {formatMinutes(vehicle.today.remaining_driving)}
                          </span>
                        </div>
                        {vehicle.location?.speed > 0 && (
                          <p className="text-xs text-blue-500 mt-1">
                            {Math.round(vehicle.location.speed)} km/h
                          </p>
                        )}
                      </div>
                    ))}
                    
                    {(!liveMapData?.vehicles || liveMapData.vehicles.length === 0) && (
                      <div className="text-center py-8 text-muted-foreground">
                        Keine Fahrzeuge in der Flotte
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 2: Driver Overview */}
        <TabsContent value="drivers" className="space-y-4">
          {/* Compliance Summary */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="bg-green-500/10 border-green-500/30">
              <CardContent className="pt-6 text-center">
                <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-green-500">
                  {driverOverview?.summary?.compliant || 0}
                </p>
                <p className="text-sm text-muted-foreground">Konform</p>
              </CardContent>
            </Card>
            
            <Card className="bg-yellow-500/10 border-yellow-500/30">
              <CardContent className="pt-6 text-center">
                <AlertTriangle className="w-8 h-8 text-yellow-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-yellow-500">
                  {driverOverview?.summary?.warning || 0}
                </p>
                <p className="text-sm text-muted-foreground">Warnung</p>
              </CardContent>
            </Card>
            
            <Card className="bg-red-500/10 border-red-500/30">
              <CardContent className="pt-6 text-center">
                <XCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-red-500">
                  {driverOverview?.summary?.critical || 0}
                </p>
                <p className="text-sm text-muted-foreground">Kritisch</p>
              </CardContent>
            </Card>
          </div>

          {/* Driver Table */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                Lenk- & Ruhezeiten
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fahrer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Heute</TableHead>
                    <TableHead>Woche</TableHead>
                    <TableHead>Rest Heute</TableHead>
                    <TableHead>Rest Woche</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {driverOverview?.drivers?.map((driver) => (
                    <TableRow key={driver.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{driver.name}</p>
                          {driver.warnings?.length > 0 && (
                            <p className="text-xs text-yellow-500">{driver.warnings[0]}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getComplianceBadge(driver.compliance)}</TableCell>
                      <TableCell className="font-mono">
                        {formatMinutes(driver.today.driving_minutes)}
                      </TableCell>
                      <TableCell className="font-mono">
                        {formatMinutes(driver.week.driving_minutes)}
                      </TableCell>
                      <TableCell className="font-mono text-green-500">
                        {formatMinutes(driver.today.remaining_driving)}
                      </TableCell>
                      <TableCell className="font-mono text-green-500">
                        {formatMinutes(driver.week.remaining_driving)}
                      </TableCell>
                    </TableRow>
                  ))}
                  
                  {(!driverOverview?.drivers || driverOverview.drivers.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Keine Fahrer in der Flotte
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Cost Overview */}
        <TabsContent value="costs" className="space-y-4">
          {/* Period Selector */}
          <div className="flex items-center gap-4">
            <Label>Zeitraum:</Label>
            <Select value={costPeriod} onValueChange={setCostPeriod}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Heute</SelectItem>
                <SelectItem value="week">Diese Woche</SelectItem>
                <SelectItem value="month">Dieser Monat</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Cost Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <MapPin className="w-8 h-8 text-primary opacity-50" />
                  <div>
                    <p className="text-sm text-muted-foreground">Kilometer</p>
                    <p className="text-xl font-bold">{costOverview?.totals?.kilometers?.toLocaleString() || 0} km</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Fuel className="w-8 h-8 text-blue-500 opacity-50" />
                  <div>
                    <p className="text-sm text-muted-foreground">Kraftstoff</p>
                    <p className="text-xl font-bold text-blue-500">{costOverview?.totals?.fuel_cost?.toFixed(2) || 0} €</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Euro className="w-8 h-8 text-orange-500 opacity-50" />
                  <div>
                    <p className="text-sm text-muted-foreground">Maut</p>
                    <p className="text-xl font-bold text-orange-500">{costOverview?.totals?.toll_cost?.toFixed(2) || 0} €</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-primary/10 border-primary/30">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-8 h-8 text-primary opacity-50" />
                  <div>
                    <p className="text-sm text-muted-foreground">Gesamt</p>
                    <p className="text-xl font-bold text-primary">{costOverview?.totals?.total_cost?.toFixed(2) || 0} €</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Cost per Driver Table */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Euro className="w-5 h-5 text-primary" />
                Kosten pro Fahrer
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fahrer</TableHead>
                    <TableHead>Fahrzeug</TableHead>
                    <TableHead className="text-right">Kilometer</TableHead>
                    <TableHead className="text-right">Kraftstoff</TableHead>
                    <TableHead className="text-right">Maut</TableHead>
                    <TableHead className="text-right">Gesamt</TableHead>
                    <TableHead className="text-right">€/km</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costOverview?.drivers?.map((driver) => (
                    <TableRow key={driver.driver_id}>
                      <TableCell className="font-medium">{driver.driver_name}</TableCell>
                      <TableCell className="text-muted-foreground">{driver.vehicle}</TableCell>
                      <TableCell className="text-right font-mono">{driver.kilometers} km</TableCell>
                      <TableCell className="text-right font-mono text-blue-500">{driver.costs.fuel.toFixed(2)} €</TableCell>
                      <TableCell className="text-right font-mono text-orange-500">{driver.costs.toll.toFixed(2)} €</TableCell>
                      <TableCell className="text-right font-mono font-bold">{driver.costs.total.toFixed(2)} €</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">{driver.efficiency.cost_per_km.toFixed(3)} €</TableCell>
                    </TableRow>
                  ))}
                  
                  {(!costOverview?.drivers || costOverview.drivers.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Keine Kostendaten verfügbar
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Disclaimer */}
          <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
            <span className="text-sm text-muted-foreground">
              Alle Kosten sind Schätzungen basierend auf Fahrzeit und Durchschnittsverbrauch.
            </span>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FleetManager;
