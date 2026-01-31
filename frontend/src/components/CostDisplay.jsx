import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Euro, 
  Fuel, 
  Calculator,
  AlertTriangle,
  TrendingUp
} from "lucide-react";

/**
 * Kosten-Anzeige Komponente
 * Zeigt Maut, Kraftstoff und Gesamtkosten
 */

const CostDisplay = ({ 
  tollCost = null, 
  distanceKm = 0, 
  fuelConsumption = 32, // L/100km
  fuelPrice = 1.85 // EUR/L
}) => {
  const { i18n } = useTranslation();
  
  // Kraftstoffkosten berechnen
  const fuelNeeded = (distanceKm / 100) * fuelConsumption;
  const fuelCost = fuelNeeded * fuelPrice;
  
  // Gesamtkosten
  const tollAmount = tollCost?.toll_cost || 0;
  const totalCost = tollAmount + fuelCost;
  
  return (
    <Card className="bg-card border-border" data-testid="cost-display">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Calculator className="w-5 h-5 text-primary" />
          {i18n.language === "de" ? "Fahrtkosten" : "Trip Costs"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        
        {/* Mautkosten */}
        <div className="flex items-center justify-between p-3 bg-orange-500/10 rounded-lg border border-orange-500/30">
          <div className="flex items-center gap-3">
            <Euro className="w-5 h-5 text-orange-500" />
            <span className="font-medium">
              {i18n.language === "de" ? "Mautkosten" : "Toll Costs"}
            </span>
          </div>
          <div className="text-right">
            <span className="text-xl font-bold text-orange-500">
              {tollAmount.toFixed(2)} €
            </span>
            {tollCost?.is_estimate && (
              <p className="text-xs text-muted-foreground">
                {i18n.language === "de" ? "Schätzung" : "Estimate"}
              </p>
            )}
          </div>
        </div>
        
        {/* Kraftstoffkosten */}
        <div className="flex items-center justify-between p-3 bg-blue-500/10 rounded-lg border border-blue-500/30">
          <div className="flex items-center gap-3">
            <Fuel className="w-5 h-5 text-blue-500" />
            <div>
              <span className="font-medium">
                {i18n.language === "de" ? "Kraftstoff" : "Fuel"}
              </span>
              <p className="text-xs text-muted-foreground">
                {fuelNeeded.toFixed(1)} L × {fuelPrice.toFixed(2)} €
              </p>
            </div>
          </div>
          <span className="text-xl font-bold text-blue-500">
            {fuelCost.toFixed(2)} €
          </span>
        </div>
        
        {/* Gesamtkosten */}
        <div className="flex items-center justify-between p-4 bg-primary/10 rounded-lg border-2 border-primary/30">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-6 h-6 text-primary" />
            <span className="font-bold text-lg">
              {i18n.language === "de" ? "Gesamt" : "Total"}
            </span>
          </div>
          <span className="text-2xl font-bold text-primary">
            {totalCost.toFixed(2)} €
          </span>
        </div>
        
        {/* Disclaimer */}
        <div className="flex items-start gap-2 p-2 bg-yellow-500/10 rounded text-xs text-muted-foreground">
          <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
          <span>
            {i18n.language === "de" 
              ? "Alle Kosten sind Schätzungen. Tatsächliche Maut- und Kraftstoffkosten können abweichen."
              : "All costs are estimates. Actual toll and fuel costs may vary."
            }
          </span>
        </div>
        
      </CardContent>
    </Card>
  );
};

export default CostDisplay;
