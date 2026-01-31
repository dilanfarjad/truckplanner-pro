import { useEffect, useState, createContext, useContext } from "react";
import "@/App.css";
import "@/i18n";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import axios from "axios";
import { Toaster, toast } from "sonner";

// Pages
import LandingPage from "@/pages/LandingPage";
import Dashboard from "@/pages/Dashboard";
import DriverDashboard from "@/pages/DriverDashboard";
import ManagerDashboard from "@/pages/ManagerDashboard";
import RoutePlanner from "@/pages/RoutePlanner";
import SimpleRoutePlanner from "@/pages/SimpleRoutePlanner";
import DrivingLog from "@/pages/DrivingLog";
import Vehicles from "@/pages/Vehicles";
import Settings from "@/pages/Settings";
import FleetManager from "@/pages/FleetManager";

// Components
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import NotificationBell from "@/components/NotificationBell";
import InstallPWA from "@/components/InstallPWA";

const BACKEND_URL = 'https://8000-ivlygrxrma1o0aqwusken-74e26e8f.us2.manus.computer';
export const API = `${BACKEND_URL}/api`;

// Auth Context
const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [loading, setLoading] = useState(true);
  const { i18n } = useTranslation();

  useEffect(() => {
    const checkAuth = async () => {
      if (token) {
        try {
          const response = await axios.get(`${API}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setUser(response.data);
          i18n.changeLanguage(response.data.language || "de");
        } catch (e) {
          localStorage.removeItem("token");
          setToken(null);
        }
      }
      setLoading(false);
    };
    checkAuth();
  }, [token, i18n]);

  const login = async (email, password) => {
    const response = await axios.post(`${API}/auth/login`, { email, password });
    const { access_token, user: userData } = response.data;
    localStorage.setItem("token", access_token);
    setToken(access_token);
    setUser(userData);
    i18n.changeLanguage(userData.language || "de");
    return userData;
  };

  const register = async (email, password, name, language = "de", role = "driver") => {
    const response = await axios.post(`${API}/auth/register`, { email, password, name, language, role });
    const { access_token, user: userData } = response.data;
    localStorage.setItem("token", access_token);
    setToken(access_token);
    setUser(userData);
    i18n.changeLanguage(language);
    return userData;
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
  };

  const updateLanguage = async (language) => {
    if (token) {
      await axios.put(`${API}/auth/language?language=${language}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
    }
    i18n.changeLanguage(language);
    setUser(prev => prev ? { ...prev, language } : null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, updateLanguage }}>
      {children}
    </AuthContext.Provider>
  );
};

// Protected Route with Role-Based Redirect
const ProtectedRoute = ({ children, requiredRole }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  // Role-based access control
  if (requiredRole && user.role !== requiredRole) {
    // Redirect to appropriate dashboard
    if (user.role === "manager") {
      return <Navigate to="/manager" replace />;
    }
    return <Navigate to="/driver" replace />;
  }

  return children;
};

// Smart Dashboard Redirect based on Role
const SmartDashboard = () => {
  const { user } = useAuth();
  
  if (user?.role === "manager") {
    return <ManagerDashboard />;
  }
  return <DriverDashboard />;
};

// App Layout with Sidebar - For pages that need sidebar
const AppLayout = ({ children }) => {
  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      <main className="flex-1 md:ml-64 pb-24 md:pb-0">
        {children}
      </main>
      <MobileNav />
    </div>
  );
};

// Minimal Layout - For full-screen pages like route planner
const MinimalLayout = ({ children }) => {
  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {children}
    </div>
  );
};

function App() {
  useEffect(() => {
    // Force dark mode
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public */}
            <Route path="/" element={<LandingPage />} />
            
            {/* Smart Dashboard - redirects based on role */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <MinimalLayout>
                    <SmartDashboard />
                  </MinimalLayout>
                </ProtectedRoute>
              }
            />
            
            {/* Driver Dashboard */}
            <Route
              path="/driver"
              element={
                <ProtectedRoute>
                  <MinimalLayout>
                    <DriverDashboard />
                  </MinimalLayout>
                </ProtectedRoute>
              }
            />
            
            {/* Manager Dashboard */}
            <Route
              path="/manager"
              element={
                <ProtectedRoute requiredRole="manager">
                  <MinimalLayout>
                    <ManagerDashboard />
                  </MinimalLayout>
                </ProtectedRoute>
              }
            />
            
            {/* Route Planner - Full screen Google Maps Style */}
            <Route
              path="/route-planner"
              element={
                <ProtectedRoute>
                  <SimpleRoutePlanner />
                </ProtectedRoute>
              }
            />
            
	            {/* Advanced Route Planner (DEPRECATED) */}
	            <Route
	              path="/route-planner-advanced"
	              element={
	                <ProtectedRoute>
	                  <MinimalLayout>
	                    <RoutePlanner />
	                  </MinimalLayout>
	                </ProtectedRoute>
	              }
	            />
            
            {/* Other pages with sidebar */}
            <Route
              path="/driving-log"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <DrivingLog />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/vehicles"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Vehicles />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Settings />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/fleet"
              element={
                <ProtectedRoute requiredRole="manager">
                  <MinimalLayout>
                    <ManagerDashboard />
                  </MinimalLayout>
                </ProtectedRoute>
              }
            />
          </Routes>
          <Toaster 
            position="top-right" 
            theme="dark"
            toastOptions={{
              style: {
                background: 'hsl(240 10% 7%)',
                border: '1px solid hsl(240 4% 16%)',
                color: 'hsl(0 0% 98%)'
              }
            }}
          />
          <InstallPWA />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
