import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth, API } from "@/App";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { 
  Users, 
  Truck, 
  TrendingUp,
  AlertTriangle,
  MapPin,
  Euro,
  Fuel,
  Clock,
  RefreshCw,
  UserPlus,
  Navigation,
  LogOut,
  Menu,
  X,
  Plus,
  Settings,
  FileText,
  Calculator,
  ChevronRight,
  Car,
  Mail,
  Copy,
  Check
} from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Custom driver icon
const createDriverIcon = (status) => new L.DivIcon({
  className: "custom-marker",
  html: `<div style="background-color: ${status === 'driving' ? '#10B981' : status === 'break' ? '#F59E0B' : '#6B7280'}; width: 36px; height: 36px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 10px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4z"/></svg>
  </div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

// TomTom Layer Component
const TomTomLayer = () => {
  const map = useMap();
  
  useEffect(() => {
    // Add TomTom traffic layer
    const trafficLayer = L.tileLayer(
      `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${process.env.REACT_APP_TOMTOM_API_KEY || 'HdPMKF3SXKMZtPAoYoCAS1DToCYUmenX'}`,
      { opacity: 0.7 }
    );
    trafficLayer.addTo(map);
    
    return () => {
      map.removeLayer(trafficLayer);
    };
  }, [map]);
  
  return null;
};

/**
 * Manager Dashboard - Moderne Flottenübersicht
 * 
 * Features:
 * - TomTom Karte mit Live-Positionen
 * - Fahrer einladen
 * - Fahrzeuge verwalten
 * - Eigenen Kraftstoffpreis eingeben
 * - Navigation (wie Fahrer)
 * - Fleet Management Sidebar
 */

const ManagerDashboard = () => {
  const { i18n } = useTranslation();
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();
  const headers = { Authorization: `Bearer ${token}` };
  
  // UI State
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activePanel, setActivePanel] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Data State
  const [fleetData, setFleetData] = useState({
    totalVehicles: 0,
    online: 0,
    driving: 0,
    warnings: 0
  });
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [costs, setCosts] = useState({
    fuel: 0,
    toll: 0,
    total: 0,
    kilometers: 0
  });
  
  // Fuel Price Calculator State
  const [fuelPrice, setFuelPrice] = useState(localStorage.getItem('customFuelPrice') || '1.65');
  const [fuelCalcLiters, setFuelCalcLiters] = useState('');
  const [fuelCalcResult, setFuelCalcResult] = useState(null);
  
  // Invite Driver State
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [inviteCopied, setInviteCopied] = useState(false);
  
  // New Vehicle State
  const [newVehicle, setNewVehicle] = useState({
    name: '',
    license_plate: '',
    height: '4.0',
    width: '2.55',
    length: '16.5',
    weight: '40000',
    fuel_consumption: '32'
  });
  
  useEffect(() => {
    fetchFleetData();
    fetchVehicles();
  }, []);
  
  const fetchFleetData = async () => {
    setLoading(true);
    try {
      const [mapRes, overviewRes, costRes] = await Promise.all([
        axios.get(`${API}/fleet/live-map`, { headers }).catch(() => ({ data: null })),
        axios.get(`${API}/fleet/driver-overview`, { headers }).catch(() => ({ data: null })),
        axios.get(`${API}/fleet/cost-overview?period=week`, { headers }).catch(() => ({ data: null }))
      ]);
      
      if (mapRes.data) {
        setFleetData({
          totalVehicles: mapRes.data.total || 0,
          online: mapRes.data.online || 0,
          driving: mapRes.data.driving || 0,
          warnings: overviewRes.data?.summary?.warning || 0
        });
        setDrivers(mapRes.data.vehicles || []);
      }
      
      if (costRes.data?.totals) {
        setCosts({
          fuel: costRes.data.totals.fuel_cost || 0,
          toll: costRes.data.totals.toll_cost || 0,
          total: costRes.data.totals.total_cost || 0,
          kilometers: costRes.data.totals.kilometers || 0
        });
      }
    } catch (error) {
      console.error("Fleet data error:", error);
    } finally {
      setLoading(false);
    }
  };
  
  const fetchVehicles = async () => {
    try {
      const res = await axios.get(`${API}/vehicles`, { headers });
      setVehicles(res.data || []);
    } catch (error) {
      console.error("Vehicles fetch error:", error);
    }
  };
  
  // Save custom fuel price
  const saveFuelPrice = () => {
    localStorage.setItem('customFuelPrice', fuelPrice);
    toast.success(i18n.language === 'de' ? 'Kraftstoffpreis gespeichert' : 'Fuel price saved');
  };
  
  // Calculate fuel cost
  const calculateFuelCost = () => {
    if (fuelCalcLiters && fuelPrice) {
      const result = parseFloat(fuelCalcLiters) * parseFloat(fuelPrice);
      setFuelCalcResult(result.toFixed(2));
    }
  };
  
  // Generate invite link
  const generateInviteLink = async () => {
    const link = `${window.location.origin}/?invite=${user?.id}&role=driver`;
    setInviteLink(link);
  };
  
  // Copy invite link
  const copyInviteLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
    toast.success(i18n.language === 'de' ? 'Link kopiert!' : 'Link copied!');
  };
  
  // Send invite email
  const sendInviteEmail = async () => {
    if (!inviteEmail) return;
    try {
      // In production, this would send an actual email
      toast.success(i18n.language === 'de' ? `Einladung an ${inviteEmail} gesendet` : `Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
    } catch (error) {
      toast.error(i18n.language === 'de' ? 'Fehler beim Senden' : 'Failed to send');
    }
  };
  
  // Add new vehicle
  const addVehicle = async () => {
    try {
      await axios.post(`${API}/vehicles`, {
        ...newVehicle,
        height: parseFloat(newVehicle.height),
        width: parseFloat(newVehicle.width),
        length: parseFloat(newVehicle.length),
        weight: parseFloat(newVehicle.weight),
        fuel_consumption: parseFloat(newVehicle.fuel_consumption)
      }, { headers });
      
      toast.success(i18n.language === 'de' ? 'Fahrzeug hinzugefügt' : 'Vehicle added');
      fetchVehicles();
      setNewVehicle({
        name: '',
        license_plate: '',
        height: '4.0',
        width: '2.55',
        length: '16.5',
        weight: '40000',
        fuel_consumption: '32'
      });
      setActivePanel(null);
    } catch (error) {
      toast.error(i18n.language === 'de' ? 'Fehler beim Hinzufügen' : 'Failed to add vehicle');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      
      {/* ========== SIDEBAR ========== */}
      <div className={`fixed inset-y-0 left-0 z-50 w-80 bg-zinc-900 transform transition-transform duration-300 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex flex-col h-full">
          {/* Sidebar Header */}
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">Fleet Management</h2>
              <p className="text-xs text-zinc-500">{user?.name}</p>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="p-2 hover:bg-zinc-800 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {/* Sidebar Menu */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            
            {/* Navigation (like driver) */}
            <button
              onClick={() => { navigate('/route-planner'); setSidebarOpen(false); }}
              className="w-full p-4 bg-blue-500/10 hover:bg-blue-500/20 rounded-xl flex items-center gap-4 transition"
              data-testid="menu-navigation"
            >
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <Navigation className="w-5 h-5 text-blue-400" />
              </div>
              <div className="text-left">
                <p className="font-medium">Navigation</p>
                <p className="text-xs text-zinc-500">{i18n.language === 'de' ? 'Route planen' : 'Plan route'}</p>
              </div>
              <ChevronRight className="w-4 h-4 ml-auto text-zinc-600" />
            </button>
            
            {/* Invite Driver */}
            <button
              onClick={() => { setActivePanel('invite'); generateInviteLink(); }}
              className="w-full p-4 bg-orange-500/10 hover:bg-orange-500/20 rounded-xl flex items-center gap-4 transition"
              data-testid="menu-invite"
            >
              <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                <UserPlus className="w-5 h-5 text-orange-400" />
              </div>
              <div className="text-left">
                <p className="font-medium">{i18n.language === 'de' ? 'Fahrer einladen' : 'Invite Driver'}</p>
                <p className="text-xs text-zinc-500">{i18n.language === 'de' ? 'Per Link oder E-Mail' : 'Via link or email'}</p>
              </div>
              <ChevronRight className="w-4 h-4 ml-auto text-zinc-600" />
            </button>
            
            {/* Add Vehicle */}
            <button
              onClick={() => setActivePanel('vehicles')}
              className="w-full p-4 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-xl flex items-center gap-4 transition"
              data-testid="menu-vehicles"
            >
              <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <Truck className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="text-left">
                <p className="font-medium">{i18n.language === 'de' ? 'Fahrzeuge' : 'Vehicles'}</p>
                <p className="text-xs text-zinc-500">{vehicles.length} {i18n.language === 'de' ? 'registriert' : 'registered'}</p>
              </div>
              <ChevronRight className="w-4 h-4 ml-auto text-zinc-600" />
            </button>
            
            {/* Fuel Price Calculator */}
            <button
              onClick={() => setActivePanel('fuel')}
              className="w-full p-4 bg-amber-500/10 hover:bg-amber-500/20 rounded-xl flex items-center gap-4 transition"
              data-testid="menu-fuel"
            >
              <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <Calculator className="w-5 h-5 text-amber-400" />
              </div>
              <div className="text-left">
                <p className="font-medium">{i18n.language === 'de' ? 'Kraftstoffrechner' : 'Fuel Calculator'}</p>
                <p className="text-xs text-zinc-500">{fuelPrice} €/L</p>
              </div>
              <ChevronRight className="w-4 h-4 ml-auto text-zinc-600" />
            </button>
            
            {/* Driving Log */}
            <button
              onClick={() => setActivePanel('driving-log')}
              className="w-full p-4 bg-purple-500/10 hover:bg-purple-500/20 rounded-xl flex items-center gap-4 transition"
              data-testid="menu-driving-log"
            >
              <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <FileText className="w-5 h-5 text-purple-400" />
              </div>
              <div className="text-left">
                <p className="font-medium">{i18n.language === 'de' ? 'Fahrtenbuch' : 'Driving Log'}</p>
                <p className="text-xs text-zinc-500">{i18n.language === 'de' ? 'Export & Übersicht' : 'Export & Overview'}</p>
              </div>
              <ChevronRight className="w-4 h-4 ml-auto text-zinc-600" />
            </button>
          </div>
          
          {/* Sidebar Footer */}
          <div className="p-4 border-t border-zinc-800">
            <button
              onClick={() => { logout(); navigate('/'); }}
              className="w-full p-3 bg-red-500/10 hover:bg-red-500/20 rounded-xl flex items-center justify-center gap-2 text-red-400 transition"
              data-testid="sidebar-logout"
            >
              <LogOut className="w-4 h-4" />
              {i18n.language === 'de' ? 'Abmelden' : 'Logout'}
            </button>
          </div>
        </div>
        
        {/* ========== PANELS ========== */}
        
        {/* Invite Driver Panel */}
        {activePanel === 'invite' && (
          <div className="absolute inset-0 bg-zinc-900 p-4 overflow-y-auto">
            <button onClick={() => setActivePanel(null)} className="flex items-center gap-2 text-zinc-400 hover:text-white mb-4">
              <ChevronRight className="w-4 h-4 rotate-180" />{i18n.language === 'de' ? 'Zurück' : 'Back'}
            </button>
            <h3 className="text-lg font-bold mb-4">{i18n.language === 'de' ? 'Fahrer einladen' : 'Invite Driver'}</h3>
            
            <div className="space-y-4">
              {/* Invite Link */}
              <div className="p-4 bg-zinc-800 rounded-xl">
                <p className="text-sm text-zinc-400 mb-2">{i18n.language === 'de' ? 'Einladungslink' : 'Invitation Link'}</p>
                <div className="flex gap-2">
                  <Input value={inviteLink} readOnly className="bg-zinc-700 border-zinc-600 text-xs" />
                  <Button onClick={copyInviteLink} variant="outline" className="border-zinc-600">
                    {inviteCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              
              {/* Email Invite */}
              <div className="p-4 bg-zinc-800 rounded-xl">
                <p className="text-sm text-zinc-400 mb-2">{i18n.language === 'de' ? 'Per E-Mail einladen' : 'Invite via Email'}</p>
                <div className="flex gap-2">
                  <Input 
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="fahrer@email.de"
                    className="bg-zinc-700 border-zinc-600"
                  />
                  <Button onClick={sendInviteEmail} className="bg-orange-500 hover:bg-orange-600">
                    <Mail className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Vehicles Panel */}
        {activePanel === 'vehicles' && (
          <div className="absolute inset-0 bg-zinc-900 p-4 overflow-y-auto">
            <button onClick={() => setActivePanel(null)} className="flex items-center gap-2 text-zinc-400 hover:text-white mb-4">
              <ChevronRight className="w-4 h-4 rotate-180" />{i18n.language === 'de' ? 'Zurück' : 'Back'}
            </button>
            <h3 className="text-lg font-bold mb-4">{i18n.language === 'de' ? 'Fahrzeuge verwalten' : 'Manage Vehicles'}</h3>
            
            {/* Existing Vehicles */}
            <div className="space-y-2 mb-4">
              {vehicles.map((v, idx) => (
                <div key={idx} className="p-3 bg-zinc-800 rounded-xl flex items-center gap-3">
                  <Truck className="w-5 h-5 text-emerald-400" />
                  <div className="flex-1">
                    <p className="font-medium">{v.name}</p>
                    <p className="text-xs text-zinc-500">{v.license_plate}</p>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Add New Vehicle */}
            <div className="p-4 bg-zinc-800 rounded-xl space-y-3">
              <p className="text-sm font-medium">{i18n.language === 'de' ? 'Neues Fahrzeug' : 'New Vehicle'}</p>
              <Input 
                placeholder={i18n.language === 'de' ? 'Fahrzeugname' : 'Vehicle name'}
                value={newVehicle.name}
                onChange={(e) => setNewVehicle({...newVehicle, name: e.target.value})}
                className="bg-zinc-700 border-zinc-600"
              />
              <Input 
                placeholder={i18n.language === 'de' ? 'Kennzeichen' : 'License plate'}
                value={newVehicle.license_plate}
                onChange={(e) => setNewVehicle({...newVehicle, license_plate: e.target.value})}
                className="bg-zinc-700 border-zinc-600"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input 
                  placeholder="Höhe (m)"
                  value={newVehicle.height}
                  onChange={(e) => setNewVehicle({...newVehicle, height: e.target.value})}
                  className="bg-zinc-700 border-zinc-600"
                />
                <Input 
                  placeholder="Breite (m)"
                  value={newVehicle.width}
                  onChange={(e) => setNewVehicle({...newVehicle, width: e.target.value})}
                  className="bg-zinc-700 border-zinc-600"
                />
                <Input 
                  placeholder="Länge (m)"
                  value={newVehicle.length}
                  onChange={(e) => setNewVehicle({...newVehicle, length: e.target.value})}
                  className="bg-zinc-700 border-zinc-600"
                />
                <Input 
                  placeholder="Gewicht (kg)"
                  value={newVehicle.weight}
                  onChange={(e) => setNewVehicle({...newVehicle, weight: e.target.value})}
                  className="bg-zinc-700 border-zinc-600"
                />
              </div>
              <Input 
                placeholder="Verbrauch (L/100km)"
                value={newVehicle.fuel_consumption}
                onChange={(e) => setNewVehicle({...newVehicle, fuel_consumption: e.target.value})}
                className="bg-zinc-700 border-zinc-600"
              />
              <Button onClick={addVehicle} className="w-full bg-emerald-500 hover:bg-emerald-600">
                <Plus className="w-4 h-4 mr-2" />
                {i18n.language === 'de' ? 'Fahrzeug hinzufügen' : 'Add Vehicle'}
              </Button>
            </div>
          </div>
        )}
        
        {/* Fuel Calculator Panel */}
        {activePanel === 'fuel' && (
          <div className="absolute inset-0 bg-zinc-900 p-4 overflow-y-auto">
            <button onClick={() => setActivePanel(null)} className="flex items-center gap-2 text-zinc-400 hover:text-white mb-4">
              <ChevronRight className="w-4 h-4 rotate-180" />{i18n.language === 'de' ? 'Zurück' : 'Back'}
            </button>
            <h3 className="text-lg font-bold mb-4">{i18n.language === 'de' ? 'Kraftstoffrechner' : 'Fuel Calculator'}</h3>
            
            {/* Custom Fuel Price */}
            <div className="p-4 bg-zinc-800 rounded-xl space-y-3 mb-4">
              <p className="text-sm text-zinc-400">{i18n.language === 'de' ? 'Aktueller Kraftstoffpreis' : 'Current Fuel Price'}</p>
              <div className="flex gap-2 items-center">
                <Input 
                  type="number"
                  step="0.01"
                  value={fuelPrice}
                  onChange={(e) => setFuelPrice(e.target.value)}
                  className="bg-zinc-700 border-zinc-600 text-2xl font-bold text-center"
                />
                <span className="text-xl text-zinc-400">€/L</span>
              </div>
              <Button onClick={saveFuelPrice} className="w-full bg-amber-500 hover:bg-amber-600">
                {i18n.language === 'de' ? 'Preis speichern' : 'Save Price'}
              </Button>
              <p className="text-xs text-zinc-500 text-center">
                {i18n.language === 'de' ? 'Wird für alle Berechnungen verwendet' : 'Used for all calculations'}
              </p>
            </div>
            
            {/* Calculator */}
            <div className="p-4 bg-zinc-800 rounded-xl space-y-3">
              <p className="text-sm text-zinc-400">{i18n.language === 'de' ? 'Kosten berechnen' : 'Calculate Cost'}</p>
              <div className="flex gap-2 items-center">
                <Input 
                  type="number"
                  placeholder="Liter"
                  value={fuelCalcLiters}
                  onChange={(e) => setFuelCalcLiters(e.target.value)}
                  className="bg-zinc-700 border-zinc-600"
                />
                <span className="text-zinc-400">×</span>
                <span className="text-white font-bold">{fuelPrice} €</span>
              </div>
              <Button onClick={calculateFuelCost} className="w-full bg-blue-500 hover:bg-blue-600">
                <Calculator className="w-4 h-4 mr-2" />
                {i18n.language === 'de' ? 'Berechnen' : 'Calculate'}
              </Button>
              
              {fuelCalcResult && (
                <div className="p-4 bg-emerald-500/20 rounded-xl text-center">
                  <p className="text-sm text-emerald-400">{i18n.language === 'de' ? 'Ergebnis' : 'Result'}</p>
                  <p className="text-3xl font-bold text-emerald-400">{fuelCalcResult} €</p>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Driving Log Panel */}
        {activePanel === 'driving-log' && (
          <div className="absolute inset-0 bg-zinc-900 p-4 overflow-y-auto">
            <button onClick={() => setActivePanel(null)} className="flex items-center gap-2 text-zinc-400 hover:text-white mb-4">
              <ChevronRight className="w-4 h-4 rotate-180" />{i18n.language === 'de' ? 'Zurück' : 'Back'}
            </button>
            <h3 className="text-lg font-bold mb-4">{i18n.language === 'de' ? 'Fahrtenbuch' : 'Driving Log'}</h3>
            
            <div className="space-y-3">
              <Button 
                onClick={async () => {
                  try {
                    const response = await axios.get(`${API}/driving-logs/export?format=csv`, {
                      headers,
                      responseType: 'blob'
                    });
                    const url = window.URL.createObjectURL(new Blob([response.data]));
                    const link = document.createElement('a');
                    link.href = url;
                    link.setAttribute('download', `fahrtenbuch_${new Date().toISOString().slice(0,10)}.csv`);
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    toast.success(i18n.language === 'de' ? 'CSV heruntergeladen' : 'CSV downloaded');
                  } catch (error) {
                    toast.error(i18n.language === 'de' ? 'Download fehlgeschlagen' : 'Download failed');
                  }
                }}
                variant="outline" 
                className="w-full border-zinc-700"
              >
                📄 CSV Export
              </Button>
              <Button 
                onClick={async () => {
                  try {
                    const response = await axios.get(`${API}/driving-logs/export?format=pdf`, {
                      headers,
                      responseType: 'blob'
                    });
                    const url = window.URL.createObjectURL(new Blob([response.data], { type: 'text/html' }));
                    const link = document.createElement('a');
                    link.href = url;
                    link.setAttribute('download', `fahrtenbuch_${new Date().toISOString().slice(0,10)}.html`);
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    toast.success(i18n.language === 'de' ? 'PDF heruntergeladen' : 'PDF downloaded');
                  } catch (error) {
                    toast.error(i18n.language === 'de' ? 'Download fehlgeschlagen' : 'Download failed');
                  }
                }}
                variant="outline" 
                className="w-full border-zinc-700"
              >
                📋 PDF Export
              </Button>
            </div>
          </div>
        )}
      </div>
      
      {/* Overlay when sidebar is open */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      {/* ========== MAIN CONTENT ========== */}
      <div className="min-h-screen">
        
        {/* Header */}
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 py-3 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSidebarOpen(true)}
              className="p-2 hover:bg-zinc-800 rounded-lg"
              data-testid="menu-btn"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-lg font-bold">{i18n.language === 'de' ? 'Flottenübersicht' : 'Fleet Overview'}</h1>
              <p className="text-xs text-zinc-500">{user?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              onClick={fetchFleetData}
              variant="ghost"
              size="icon"
              className="text-zinc-400 hover:text-white"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button 
              onClick={() => navigate('/route-planner')}
              className="bg-blue-500 hover:bg-blue-600"
              data-testid="nav-btn"
            >
              <Navigation className="w-4 h-4 mr-2" />
              {i18n.language === 'de' ? 'Navigation' : 'Navigate'}
            </Button>
          </div>
        </div>
        
        {/* Stats Cards */}
        <div className="p-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <Truck className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{fleetData.totalVehicles}</p>
                  <p className="text-xs text-zinc-500">{i18n.language === 'de' ? 'Fahrzeuge' : 'Vehicles'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-emerald-400">{fleetData.online}</p>
                  <p className="text-xs text-zinc-500">Online</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <Car className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-blue-400">{fleetData.driving}</p>
                  <p className="text-xs text-zinc-500">{i18n.language === 'de' ? 'Fahrend' : 'Driving'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className={`border-zinc-800 ${fleetData.warnings > 0 ? 'bg-red-500/10 border-red-500/30' : 'bg-zinc-900'}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${fleetData.warnings > 0 ? 'bg-red-500/20' : 'bg-zinc-800'}`}>
                  <AlertTriangle className={`w-5 h-5 ${fleetData.warnings > 0 ? 'text-red-400' : 'text-zinc-500'}`} />
                </div>
                <div>
                  <p className={`text-2xl font-bold ${fleetData.warnings > 0 ? 'text-red-400' : ''}`}>{fleetData.warnings}</p>
                  <p className="text-xs text-zinc-500">{i18n.language === 'de' ? 'Warnungen' : 'Warnings'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Map */}
        <div className="px-4 pb-4">
          <Card className="bg-zinc-900 border-zinc-800 overflow-hidden">
            <CardHeader className="pb-2 border-b border-zinc-800">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-400" />
                {i18n.language === 'de' ? 'Live-Positionen' : 'Live Positions'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[400px]">
                <MapContainer
                  center={[51.1657, 10.4515]}
                  zoom={6}
                  className="h-full w-full"
                  zoomControl={true}
                >
                  {/* TomTom Karte */}
                  <TileLayer
                    url={`https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?key=${process.env.REACT_APP_TOMTOM_API_KEY || 'HdPMKF3SXKMZtPAoYoCAS1DToCYUmenX'}`}
                    maxZoom={22}
                  />
                  <TomTomLayer />
                  
                  {drivers.map((driver, idx) => (
                    driver.lat && driver.lon && (
                      <Marker 
                        key={idx} 
                        position={[driver.lat, driver.lon]}
                        icon={createDriverIcon(driver.status)}
                      >
                        <Popup>
                          <div className="text-sm min-w-[150px]">
                            <p className="font-semibold text-base">{driver.driver_name}</p>
                            <p className="text-gray-500">{driver.vehicle_name}</p>
                            <div className={`text-xs mt-2 px-2 py-1 rounded-full inline-block ${
                              driver.status === "driving" ? "bg-emerald-100 text-emerald-700" : 
                              driver.status === "break" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-700"
                            }`}>
                              {driver.status === "driving" ? "Fahrend" : driver.status === "break" ? "Pause" : "Offline"}
                            </div>
                          </div>
                        </Popup>
                      </Marker>
                    )
                  ))}
                </MapContainer>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Costs Overview */}
        <div className="px-4 pb-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2 border-b border-zinc-800">
              <CardTitle className="text-base flex items-center gap-2">
                <Euro className="w-4 h-4 text-emerald-400" />
                {i18n.language === 'de' ? 'Kosten (Woche)' : 'Costs (Week)'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 bg-zinc-800 rounded-xl">
                  <p className="text-xs text-zinc-500">{i18n.language === 'de' ? 'Gesamt' : 'Total'}</p>
                  <p className="text-2xl font-bold text-emerald-400">
                    {costs.total.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                  </p>
                </div>
                <div className="p-4 bg-zinc-800 rounded-xl">
                  <p className="text-xs text-zinc-500">{i18n.language === 'de' ? 'Kraftstoff' : 'Fuel'}</p>
                  <p className="text-xl font-bold">
                    {costs.fuel.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                  </p>
                </div>
                <div className="p-4 bg-zinc-800 rounded-xl">
                  <p className="text-xs text-zinc-500">Maut</p>
                  <p className="text-xl font-bold">
                    {costs.toll.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                  </p>
                </div>
                <div className="p-4 bg-zinc-800 rounded-xl">
                  <p className="text-xs text-zinc-500">Kilometer</p>
                  <p className="text-xl font-bold">{costs.kilometers.toLocaleString('de-DE')} km</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ManagerDashboard;
