import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  Camera, 
  AlertTriangle,
  Eye,
  EyeOff,
  Info,
  MapPin
} from "lucide-react";

/**
 * Blitzer-Warnung Komponente
 * 
 * ⚠️ RECHTLICHER HINWEIS (Deutschland):
 * Nutzung während der Fahrt ist verboten!
 * Nur zur Routenplanung VOR Fahrtantritt.
 */

const SpeedCameraWarning = ({ 
  cameras = [], 
  showOnMap = true, 
  onToggleShow 
}) => {
  const { i18n } = useTranslation();
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  
  // Gruppiere nach Typ
  const fixedCameras = cameras.filter(c => c.type === 'fixed');
  const mobileCameras = cameras.filter(c => c.type === 'mobile');
  const sectionControls = cameras.filter(c => c.type === 'section_control');
  const redLightCameras = cameras.filter(c => c.type === 'red_light');
  
  if (!acknowledged) {
    return (
      <Card className="bg-yellow-500/10 border-yellow-500/30" data-testid="speed-camera-disclaimer">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-yellow-500">
            <AlertTriangle className="w-5 h-5" />
            {i18n.language === "de" ? "Rechtlicher Hinweis" : "Legal Notice"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {i18n.language === "de" 
              ? "Gemäß § 23 Abs. 1c StVO ist die Nutzung von Blitzer-Warnern während der Fahrt für den Fahrer verboten. Diese Funktion dient ausschließlich zur Routenplanung VOR Fahrtantritt."
              : "According to German traffic regulations (§ 23 StVO), the use of speed camera warnings while driving is prohibited for the driver. This feature is for route planning BEFORE departure only."
            }
          </p>
          
          <div className="flex items-center gap-2 p-3 bg-red-500/10 rounded-lg border border-red-500/30">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <span className="text-sm font-medium text-red-500">
              {i18n.language === "de" 
                ? "Bei Verstoß: 75€ Bußgeld + 1 Punkt"
                : "Violation: €75 fine + 1 point"
              }
            </span>
          </div>
          
          <Button 
            onClick={() => setAcknowledged(true)}
            className="w-full"
            data-testid="acknowledge-disclaimer-btn"
          >
            {i18n.language === "de" 
              ? "Verstanden - nur zur Planung"
              : "Understood - for planning only"
            }
          </Button>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className="bg-card border-border" data-testid="speed-camera-display">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Camera className="w-5 h-5 text-yellow-500" />
            {i18n.language === "de" ? "Blitzer auf Route" : "Speed Cameras on Route"}
            <span className="text-sm font-normal text-muted-foreground">
              ({cameras.length})
            </span>
          </CardTitle>
          
          <div className="flex items-center gap-2">
            <Switch 
              checked={showOnMap} 
              onCheckedChange={onToggleShow}
              id="show-cameras"
            />
            <Label htmlFor="show-cameras" className="text-sm">
              {showOnMap ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </Label>
            
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Info className="w-4 h-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-yellow-500">
                    <AlertTriangle className="w-5 h-5" />
                    {i18n.language === "de" ? "Rechtlicher Hinweis" : "Legal Notice"}
                  </DialogTitle>
                </DialogHeader>
                <DialogDescription className="space-y-3">
                  <p>
                    {i18n.language === "de" 
                      ? "Die Nutzung von Blitzer-Warnern während der Fahrt ist in Deutschland gemäß § 23 Abs. 1c StVO für den Fahrer verboten."
                      : "The use of speed camera warnings while driving is prohibited for the driver in Germany."
                    }
                  </p>
                  <p className="font-medium text-red-500">
                    {i18n.language === "de" 
                      ? "Diese Anzeige dient nur der Routenplanung VOR Fahrtantritt!"
                      : "This display is for route planning BEFORE departure only!"
                    }
                  </p>
                </DialogDescription>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {/* Zusammenfassung */}
        <div className="grid grid-cols-2 gap-2">
          {fixedCameras.length > 0 && (
            <div className="p-2 bg-red-500/10 rounded-lg border border-red-500/30">
              <p className="text-xs text-muted-foreground">
                {i18n.language === "de" ? "Fest" : "Fixed"}
              </p>
              <p className="font-bold text-red-500">{fixedCameras.length}</p>
            </div>
          )}
          
          {sectionControls.length > 0 && (
            <div className="p-2 bg-orange-500/10 rounded-lg border border-orange-500/30">
              <p className="text-xs text-muted-foreground">
                {i18n.language === "de" ? "Abschnitt" : "Section"}
              </p>
              <p className="font-bold text-orange-500">{sectionControls.length}</p>
            </div>
          )}
          
          {redLightCameras.length > 0 && (
            <div className="p-2 bg-yellow-500/10 rounded-lg border border-yellow-500/30">
              <p className="text-xs text-muted-foreground">
                {i18n.language === "de" ? "Rotlicht" : "Red Light"}
              </p>
              <p className="font-bold text-yellow-500">{redLightCameras.length}</p>
            </div>
          )}
          
          {mobileCameras.length > 0 && (
            <div className="p-2 bg-gray-500/10 rounded-lg border border-gray-500/30">
              <p className="text-xs text-muted-foreground">
                {i18n.language === "de" ? "Mobil (ungenau)" : "Mobile (inaccurate)"}
              </p>
              <p className="font-bold text-gray-500">{mobileCameras.length}</p>
            </div>
          )}
        </div>
        
        {/* Liste der Blitzer */}
        {cameras.length > 0 && (
          <div className="max-h-40 overflow-y-auto space-y-1">
            {cameras.slice(0, 10).map((camera, idx) => (
              <div 
                key={camera.id || idx}
                className="flex items-center justify-between p-2 bg-muted/30 rounded text-sm"
              >
                <div className="flex items-center gap-2">
                  <MapPin className="w-3 h-3 text-red-500" />
                  <span className="truncate max-w-[150px]">
                    {camera.name || `Blitzer ${idx + 1}`}
                  </span>
                </div>
                <span className="text-muted-foreground">
                  {camera.speed_limit !== 'unbekannt' ? `${camera.speed_limit} km/h` : '—'}
                </span>
              </div>
            ))}
            
            {cameras.length > 10 && (
              <p className="text-xs text-center text-muted-foreground pt-2">
                +{cameras.length - 10} {i18n.language === "de" ? "weitere" : "more"}
              </p>
            )}
          </div>
        )}
        
        {/* Warnung */}
        <div className="flex items-center gap-2 p-2 bg-yellow-500/10 rounded text-xs text-yellow-600">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            {i18n.language === "de" 
              ? "Nur zur Planung - während Fahrt nicht benutzen!"
              : "For planning only - do not use while driving!"
            }
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

export default SpeedCameraWarning;
