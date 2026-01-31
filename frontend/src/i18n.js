import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  de: {
    translation: {
      // App
      appName: "TruckerMaps",
      appSubtitle: "LKW Routenplaner",
      
      // Auth
      login: "Anmelden",
      register: "Registrieren",
      logout: "Abmelden",
      email: "E-Mail",
      password: "Passwort",
      name: "Name",
      welcomeBack: "Willkommen zurück",
      createAccount: "Konto erstellen",
      noAccount: "Noch kein Konto?",
      hasAccount: "Bereits registriert?",
      
      // Navigation
      dashboard: "Dashboard",
      routePlanner: "Routenplaner",
      drivingLog: "Fahrtenbuch",
      vehicles: "Fahrzeuge",
      settings: "Einstellungen",
      
      // Vehicle Types
      sattelzug: "Sattelzug",
      gliederzug: "Gliederzug",
      solo_lkw: "Solo-LKW",
      omnibus: "Omnibus",
      
      // Vehicle Details
      height: "Höhe",
      width: "Breite",
      length: "Länge",
      weight: "Gewicht",
      axleLoad: "Achslast",
      meters: "m",
      kg: "kg",
      tonnes: "t",
      
      // Route Planning
      startLocation: "Startort",
      destination: "Zielort",
      planRoute: "Route planen",
      distance: "Entfernung",
      duration: "Fahrzeit",
      km: "km",
      minutes: "Min",
      hours: "Std",
      
      // Driving Times
      drivingTime: "Lenkzeit",
      workTime: "Arbeitszeit",
      breakTime: "Pause",
      restTime: "Ruhezeit",
      dailyDriving: "Tägliche Lenkzeit",
      weeklyDriving: "Wöchentliche Lenkzeit",
      twoWeekDriving: "2-Wochen Lenkzeit",
      remaining: "Verbleibend",
      
      // Breaks
      breakRequired: "Pause erforderlich",
      breakSuggestion: "Pausenempfehlung",
      splitBreak: "Geteilte Pause",
      firstBlock: "1. Block (15 Min)",
      secondBlock: "2. Block (30 Min)",
      addBreak: "Pause eintragen",
      breakType: "Pausenart",
      fahrtunterbrechung: "Fahrtunterbrechung",
      pause: "Pause",
      ruhezeit: "Ruhezeit",
      
      // Warnings
      warningDrivingLimit: "Lenkzeit-Grenze erreicht",
      warningWorkLimit: "Arbeitszeit-Grenze erreicht",
      warningBreakNeeded: "Pause erforderlich",
      
      // Log
      date: "Datum",
      workStart: "Arbeitsbeginn",
      workEnd: "Arbeitsende",
      drivingStart: "Lenkzeitbeginn",
      drivingEnd: "Lenkzeitende",
      totalDriving: "Gesamte Lenkzeit",
      totalWork: "Gesamte Arbeitszeit",
      breaks: "Pausen",
      last56Days: "Letzte 56 Tage",
      
      // Actions
      save: "Speichern",
      cancel: "Abbrechen",
      delete: "Löschen",
      edit: "Bearbeiten",
      add: "Hinzufügen",
      search: "Suchen",
      
      // Status
      loading: "Lädt...",
      error: "Fehler",
      success: "Erfolgreich",
      noData: "Keine Daten",
      
      // AI
      aiAdvice: "KI-Empfehlung",
      getAdvice: "Empfehlung holen",
      
      // Holidays
      holidays: "Feiertage",
      sundayDriving: "Sonntagsfahrverbot beachten",
      
      // Rest Stops
      restStops: "Rastplätze",
      truckParking: "LKW-Parkplätze",
      findNearby: "In der Nähe suchen"
    }
  },
  en: {
    translation: {
      // App
      appName: "TruckerMaps",
      appSubtitle: "Truck Route Planner",
      
      // Auth
      login: "Login",
      register: "Register",
      logout: "Logout",
      email: "Email",
      password: "Password",
      name: "Name",
      welcomeBack: "Welcome back",
      createAccount: "Create account",
      noAccount: "No account yet?",
      hasAccount: "Already registered?",
      
      // Navigation
      dashboard: "Dashboard",
      routePlanner: "Route Planner",
      drivingLog: "Driving Log",
      vehicles: "Vehicles",
      settings: "Settings",
      
      // Vehicle Types
      sattelzug: "Semi-Truck",
      gliederzug: "Road Train",
      solo_lkw: "Rigid Truck",
      omnibus: "Bus",
      
      // Vehicle Details
      height: "Height",
      width: "Width",
      length: "Length",
      weight: "Weight",
      axleLoad: "Axle Load",
      meters: "m",
      kg: "kg",
      tonnes: "t",
      
      // Route Planning
      startLocation: "Start Location",
      destination: "Destination",
      planRoute: "Plan Route",
      distance: "Distance",
      duration: "Duration",
      km: "km",
      minutes: "min",
      hours: "hrs",
      
      // Driving Times
      drivingTime: "Driving Time",
      workTime: "Work Time",
      breakTime: "Break",
      restTime: "Rest Time",
      dailyDriving: "Daily Driving",
      weeklyDriving: "Weekly Driving",
      twoWeekDriving: "2-Week Driving",
      remaining: "Remaining",
      
      // Breaks
      breakRequired: "Break Required",
      breakSuggestion: "Break Suggestion",
      splitBreak: "Split Break",
      firstBlock: "1st Block (15 min)",
      secondBlock: "2nd Block (30 min)",
      addBreak: "Add Break",
      breakType: "Break Type",
      fahrtunterbrechung: "Driving Break",
      pause: "Break",
      ruhezeit: "Rest Period",
      
      // Warnings
      warningDrivingLimit: "Driving limit reached",
      warningWorkLimit: "Work time limit reached",
      warningBreakNeeded: "Break required",
      
      // Log
      date: "Date",
      workStart: "Work Start",
      workEnd: "Work End",
      drivingStart: "Driving Start",
      drivingEnd: "Driving End",
      totalDriving: "Total Driving",
      totalWork: "Total Work",
      breaks: "Breaks",
      last56Days: "Last 56 Days",
      
      // Actions
      save: "Save",
      cancel: "Cancel",
      delete: "Delete",
      edit: "Edit",
      add: "Add",
      search: "Search",
      
      // Status
      loading: "Loading...",
      error: "Error",
      success: "Success",
      noData: "No data",
      
      // AI
      aiAdvice: "AI Recommendation",
      getAdvice: "Get Advice",
      
      // Holidays
      holidays: "Holidays",
      sundayDriving: "Sunday driving ban applies",
      
      // Rest Stops
      restStops: "Rest Stops",
      truckParking: "Truck Parking",
      findNearby: "Find Nearby"
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'de',
    fallbackLng: 'de',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
