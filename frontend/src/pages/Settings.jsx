import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth, API } from "@/App";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { 
  Globe, 
  Bell, 
  Moon, 
  Calendar,
  Shield,
  LogOut,
  Info
} from "lucide-react";

const Settings = () => {
  const { t, i18n } = useTranslation();
  const { user, token, logout, updateLanguage } = useAuth();
  
  const [holidays, setHolidays] = useState([]);
  const [notifications, setNotifications] = useState(true);
  const [loading, setLoading] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetchHolidays();
  }, []);

  const fetchHolidays = async () => {
    try {
      const year = new Date().getFullYear();
      const response = await axios.get(`${API}/holidays/DE?year=${year}`, { headers });
      setHolidays(response.data);
    } catch (error) {
      console.error("Error fetching holidays:", error);
    }
  };

  const handleLanguageChange = async (lang) => {
    setLoading(true);
    try {
      await updateLanguage(lang);
      toast.success(lang === "de" ? "Sprache geändert" : "Language changed");
    } catch (error) {
      toast.error(t("error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6" data-testid="settings-page">
      {/* Header */}
      <div>
        <h1 className="font-heading text-3xl md:text-4xl font-bold tracking-tight">
          {t("settings")}
        </h1>
        <p className="text-muted-foreground mt-1">
          App-Einstellungen und Profil
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Language Settings */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              Sprache / Language
            </CardTitle>
            <CardDescription>
              Wählen Sie Ihre bevorzugte Sprache
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select
              value={i18n.language}
              onValueChange={handleLanguageChange}
              disabled={loading}
            >
              <SelectTrigger className="h-14" data-testid="settings-language-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="de">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🇩🇪</span>
                    Deutsch
                  </div>
                </SelectItem>
                <SelectItem value="en">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🇬🇧</span>
                    English
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              Benachrichtigungen
            </CardTitle>
            <CardDescription>
              Pausenerinnerungen und Warnungen
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div>
                <p className="font-medium">Pausenerinnerung</p>
                <p className="text-sm text-muted-foreground">
                  Benachrichtigung vor Ablauf der Lenkzeit
                </p>
              </div>
              <Switch
                checked={notifications}
                onCheckedChange={setNotifications}
                data-testid="notifications-switch"
              />
            </div>
            
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div>
                <p className="font-medium">Wochenlimit-Warnung</p>
                <p className="text-sm text-muted-foreground">
                  Warnung bei 80% der Wochenlenkzeit
                </p>
              </div>
              <Switch defaultChecked data-testid="weekly-warning-switch" />
            </div>
          </CardContent>
        </Card>

        {/* Holidays */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              {t("holidays")} {new Date().getFullYear()}
            </CardTitle>
            <CardDescription>
              {t("sundayDriving")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {holidays.map((holiday, idx) => (
                <div 
                  key={idx}
                  className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                >
                  <span className="font-medium">
                    {i18n.language === "de" ? holiday.name : holiday.name_en}
                  </span>
                  <span className="font-mono text-sm text-muted-foreground">
                    {new Date(holiday.date).toLocaleDateString(
                      i18n.language === "de" ? "de-DE" : "en-US"
                    )}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Legal Info */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              EU-Verordnungen
            </CardTitle>
            <CardDescription>
              Berücksichtigte Regelwerke
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-muted/50 rounded-lg">
              <h4 className="font-semibold mb-2">EU VO 561/2006</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Max. 4,5h Lenkzeit ohne Pause</li>
                <li>• Min. 45 Min Pause (15+30 aufteilbar)</li>
                <li>• Max. 9h tägliche Lenkzeit</li>
                <li>• Max. 56h wöchentliche Lenkzeit</li>
                <li>• Max. 90h in 2 Wochen</li>
              </ul>
            </div>
            
            <div className="p-4 bg-muted/50 rounded-lg">
              <h4 className="font-semibold mb-2">Arbeitszeitgesetz (ArbZG)</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Max. 10h tägliche Arbeitszeit</li>
                <li>• Ruhepausen nach 6h Arbeit</li>
                <li>• Min. 11h Ruhezeit zwischen Schichten</li>
              </ul>
            </div>

            <div className="p-4 bg-muted/50 rounded-lg">
              <h4 className="font-semibold mb-2">FerienReiseV</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Sonn- und Feiertagsfahrverbot</li>
                <li>• Ferienreiseverkehr-Beschränkungen</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Profile */}
        <Card className="bg-card border-border lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Profil</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-2xl font-bold text-primary">
                    {user?.name?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="font-semibold text-lg">{user?.name}</p>
                  <p className="text-muted-foreground">{user?.email}</p>
                </div>
              </div>
              
              <Button 
                variant="outline" 
                className="text-destructive hover:bg-destructive/10"
                onClick={logout}
                data-testid="settings-logout-btn"
              >
                <LogOut className="w-4 h-4 mr-2" />
                {t("logout")}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* App Info */}
        <Card className="bg-card border-border lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Info className="w-5 h-5 text-primary" />
              Über TruckerMaps
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-muted/50 rounded-lg text-center">
                <p className="text-2xl font-bold text-primary">1.0.0</p>
                <p className="text-xs text-muted-foreground">Version</p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg text-center">
                <p className="text-2xl font-bold text-secondary">561</p>
                <p className="text-xs text-muted-foreground">EU VO</p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg text-center">
                <p className="text-2xl font-bold text-warning">56</p>
                <p className="text-xs text-muted-foreground">Tage Protokoll</p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg text-center">
                <p className="text-2xl font-bold">DE/EN</p>
                <p className="text-xs text-muted-foreground">Sprachen</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Settings;
