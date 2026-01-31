import { useState, useEffect } from "react";
import { X, Share, PlusSquare, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

const InstallPWA = () => {
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);
  const [showAndroidPrompt, setShowAndroidPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if already dismissed
    if (localStorage.getItem("pwa-prompt-dismissed")) {
      setDismissed(true);
      return;
    }

    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      return;
    }

    // iOS detection
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isInStandaloneMode = window.navigator.standalone === true;

    if (isIOS && !isInStandaloneMode) {
      setTimeout(() => setShowIOSPrompt(true), 3000);
    }

    // Android/Chrome install prompt
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setTimeout(() => setShowAndroidPrompt(true), 3000);
    });
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setShowAndroidPrompt(false);
      }
      setDeferredPrompt(null);
    }
  };

  const dismiss = () => {
    setShowIOSPrompt(false);
    setShowAndroidPrompt(false);
    localStorage.setItem("pwa-prompt-dismissed", "true");
    setDismissed(true);
  };

  if (dismissed) return null;

  // iOS Install Prompt
  if (showIOSPrompt) {
    return (
      <div className="fixed bottom-24 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50 animate-in slide-in-from-bottom-4">
        <div className="bg-card border border-border rounded-xl p-4 shadow-xl">
          <div className="flex items-start justify-between mb-3">
            <h3 className="font-semibold text-lg">App installieren</h3>
            <button onClick={dismiss} className="text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <p className="text-sm text-muted-foreground mb-4">
            Installieren Sie TruckerMaps auf Ihrem iPhone:
          </p>
          
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg">
              <Share className="w-5 h-5 text-primary flex-shrink-0" />
              <span>1. Tippen Sie auf <strong>Teilen</strong></span>
            </div>
            <div className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg">
              <PlusSquare className="w-5 h-5 text-primary flex-shrink-0" />
              <span>2. Wählen Sie <strong>"Zum Home-Bildschirm"</strong></span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Android Install Prompt
  if (showAndroidPrompt && deferredPrompt) {
    return (
      <div className="fixed bottom-24 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50 animate-in slide-in-from-bottom-4">
        <div className="bg-card border border-border rounded-xl p-4 shadow-xl">
          <div className="flex items-start justify-between mb-3">
            <h3 className="font-semibold text-lg">App installieren</h3>
            <button onClick={dismiss} className="text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <p className="text-sm text-muted-foreground mb-4">
            Installieren Sie TruckerMaps für schnellen Zugriff und Offline-Nutzung.
          </p>
          
          <Button onClick={handleInstall} className="w-full">
            <Download className="w-4 h-4 mr-2" />
            Jetzt installieren
          </Button>
        </div>
      </div>
    );
  }

  return null;
};

export default InstallPWA;
