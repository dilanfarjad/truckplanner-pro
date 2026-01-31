import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { 
  Navigation, 
  Volume2, 
  VolumeX,
  ChevronRight,
  ArrowUp,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  MapPin,
  X,
  Coffee
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// Navigation icons based on maneuver type
const getManeuverIcon = (type, modifier) => {
  if (type === "turn") {
    if (modifier?.includes("left")) return ArrowLeft;
    if (modifier?.includes("right")) return ArrowRight;
  }
  if (type === "uturn" || type === "roundabout") return RotateCcw;
  if (type === "arrive") return MapPin;
  return ArrowUp;
};

const NavigationView = ({ 
  steps = [], 
  currentStepIndex = 0, 
  onClose,
  optimalRestStop,
  breakSuggestion,
  totalDistance,
  remainingDistance,
  eta
}) => {
  const { t, i18n } = useTranslation();
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [currentStep, setCurrentStep] = useState(currentStepIndex);
  const speechRef = useRef(null);

  // Speak navigation instruction
  const speak = (text) => {
    if (!voiceEnabled || !window.speechSynthesis) return;
    
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = i18n.language === "de" ? "de-DE" : "en-US";
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
    speechRef.current = utterance;
  };

  // Speak current step when it changes
  useEffect(() => {
    if (steps[currentStep]) {
      const instruction = i18n.language === "de" 
        ? steps[currentStep].instruction_de 
        : steps[currentStep].instruction;
      speak(instruction);
    }
  }, [currentStep, steps, i18n.language]);

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const formatDistance = (meters) => {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)} km`;
    }
    return `${Math.round(meters)} m`;
  };

  const step = steps[currentStep];
  const ManeuverIcon = step ? getManeuverIcon(step.maneuver_type, step.modifier) : ArrowUp;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col" data-testid="navigation-view">
      {/* Top Bar */}
      <div className="bg-primary text-primary-foreground p-4 flex items-center justify-between">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onClose}
          className="text-primary-foreground hover:bg-primary/80"
          data-testid="close-navigation-btn"
        >
          <X className="w-6 h-6" />
        </Button>
        
        <div className="text-center">
          <p className="text-sm opacity-80">{t("distance")}</p>
          <p className="font-mono text-lg font-bold">{remainingDistance || totalDistance} km</p>
        </div>
        
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => setVoiceEnabled(!voiceEnabled)}
          className="text-primary-foreground hover:bg-primary/80"
          data-testid="voice-toggle-btn"
        >
          {voiceEnabled ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
        </Button>
      </div>

      {/* Current Instruction - Big View */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-card">
        {step && (
          <>
            <div className={cn(
              "w-32 h-32 rounded-full flex items-center justify-center mb-6",
              step.maneuver_type === "arrive" ? "bg-secondary/20" : "bg-primary/20"
            )}>
              <ManeuverIcon className={cn(
                "w-16 h-16",
                step.maneuver_type === "arrive" ? "text-secondary" : "text-primary"
              )} />
            </div>
            
            <p className="text-3xl md:text-4xl font-bold text-center mb-4">
              {i18n.language === "de" ? step.instruction_de : step.instruction}
            </p>
            
            <p className="text-xl text-muted-foreground">
              {formatDistance(step.distance_meters)}
            </p>
            
            {step.road_name && (
              <p className="text-lg text-primary mt-2">{step.road_name}</p>
            )}
          </>
        )}
      </div>

      {/* Break Reminder */}
      {breakSuggestion && (
        <div className="mx-4 mb-4 p-4 bg-warning/10 border border-warning/30 rounded-xl">
          <div className="flex items-center gap-3">
            <Coffee className="w-8 h-8 text-warning" />
            <div>
              <p className="font-semibold text-warning">
                {i18n.language === "de" ? "Pause empfohlen" : "Break recommended"}
              </p>
              <p className="text-sm text-muted-foreground">
                {breakSuggestion.rest_stop_name || breakSuggestion.location.name} - {breakSuggestion.duration_minutes} min
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Optimal Rest Stop */}
      {optimalRestStop && (
        <div className="mx-4 mb-4 p-4 bg-secondary/10 border border-secondary/30 rounded-xl">
          <div className="flex items-center gap-3">
            <MapPin className="w-6 h-6 text-secondary" />
            <div>
              <p className="font-semibold text-secondary">
                {i18n.language === "de" ? "Empfohlener Rastplatz" : "Recommended rest stop"}
              </p>
              <p className="text-sm">{optimalRestStop.name}</p>
            </div>
          </div>
        </div>
      )}

      {/* Step Navigation */}
      <div className="p-4 border-t border-border flex items-center justify-between">
        <Button
          variant="outline"
          onClick={prevStep}
          disabled={currentStep === 0}
          data-testid="prev-step-btn"
        >
          Zurück
        </Button>
        
        <p className="text-sm text-muted-foreground">
          {currentStep + 1} / {steps.length}
        </p>
        
        <Button
          onClick={nextStep}
          disabled={currentStep === steps.length - 1}
          data-testid="next-step-btn"
        >
          Weiter
        </Button>
      </div>

      {/* Step List */}
      <ScrollArea className="h-48 border-t border-border">
        <div className="p-4 space-y-2">
          {steps.map((s, idx) => {
            const Icon = getManeuverIcon(s.maneuver_type, s.modifier);
            return (
              <button
                key={idx}
                onClick={() => setCurrentStep(idx)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors",
                  idx === currentStep 
                    ? "bg-primary/10 border border-primary" 
                    : "bg-muted/50 hover:bg-muted"
                )}
                data-testid={`nav-step-${idx}`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">
                    {i18n.language === "de" ? s.instruction_de : s.instruction}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDistance(s.distance_meters)}
                </span>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};

export default NavigationView;
