import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Truck, Shield, Clock, Map, Globe } from "lucide-react";

const LandingPage = () => {
  const { t, i18n } = useTranslation();
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  
  const [isLoading, setIsLoading] = useState(false);
  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [registerData, setRegisterData] = useState({ 
    email: "", 
    password: "", 
    name: "", 
    language: "de",
    role: "driver"
  });

  useEffect(() => {
    if (user) {
      navigate("/dashboard");
    }
  }, [user, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(loginData.email, loginData.password);
      toast.success(t("welcomeBack"));
      navigate("/dashboard");
    } catch (error) {
      toast.error(error.response?.data?.detail || t("error"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await register(
        registerData.email, 
        registerData.password, 
        registerData.name,
        registerData.language,
        registerData.role
      );
      toast.success(t("success"));
      navigate("/dashboard");
    } catch (error) {
      toast.error(error.response?.data?.detail || t("error"));
    } finally {
      setIsLoading(false);
    }
  };

  const features = [
    { icon: Map, title: "LKW-optimierte Routen", titleEn: "Truck-optimized routes" },
    { icon: Clock, title: "Lenk- & Ruhezeiten", titleEn: "Driving & rest times" },
    { icon: Shield, title: "EU VO 561/2006", titleEn: "EU Regulation 561/2006" },
  ];

  return (
    <div 
      className="min-h-screen bg-background relative overflow-hidden"
      data-testid="landing-page"
    >
      {/* Background */}
      <div 
        className="absolute inset-0 bg-cover bg-center opacity-20"
        style={{ 
          backgroundImage: "url('https://images.unsplash.com/photo-1579372795676-6f78fadd0639?crop=entropy&cs=srgb&fm=jpg&q=85')" 
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background/50 to-background" />

      {/* Language Switcher */}
      <div className="absolute top-4 right-4 z-20">
        <Select 
          value={i18n.language} 
          onValueChange={(val) => i18n.changeLanguage(val)}
        >
          <SelectTrigger className="w-24 bg-card/80 backdrop-blur" data-testid="language-selector">
            <Globe className="w-4 h-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="de">DE</SelectItem>
            <SelectItem value="en">EN</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 py-12 md:py-24 flex flex-col lg:flex-row items-center gap-12 min-h-screen">
        
        {/* Hero Section */}
        <div className="flex-1 text-center lg:text-left">
          <div className="flex items-center justify-center lg:justify-start gap-4 mb-6">
            <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center glow-primary">
              <Truck className="w-10 h-10 text-primary" />
            </div>
          </div>
          
          <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-4 uppercase">
            <span className="text-primary">Trucker</span>Maps
          </h1>
          
          <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-xl">
            {i18n.language === "de" 
              ? "Intelligente Routenplanung für Berufskraftfahrer mit EU-konformer Lenk- und Ruhezeitenberechnung"
              : "Smart route planning for professional drivers with EU-compliant driving and rest time calculation"
            }
          </p>

          {/* Features */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-xl mx-auto lg:mx-0">
            {features.map((feature, idx) => (
              <div 
                key={idx}
                className="flex items-center gap-3 p-4 bg-card/50 rounded-xl border border-border"
              >
                <feature.icon className="w-6 h-6 text-primary flex-shrink-0" />
                <span className="text-sm font-medium">
                  {i18n.language === "de" ? feature.title : feature.titleEn}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Auth Card */}
        <Card className="w-full max-w-md bg-card/90 backdrop-blur-md border-border">
          <CardHeader className="text-center">
            <CardTitle className="font-heading text-2xl">{t("appName")}</CardTitle>
            <CardDescription>{t("appSubtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login" data-testid="login-tab">{t("login")}</TabsTrigger>
                <TabsTrigger value="register" data-testid="register-tab">{t("register")}</TabsTrigger>
              </TabsList>
              
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">{t("email")}</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="fahrer@example.com"
                      value={loginData.email}
                      onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                      required
                      data-testid="login-email-input"
                      className="h-14"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">{t("password")}</Label>
                    <Input
                      id="login-password"
                      type="password"
                      value={loginData.password}
                      onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                      required
                      data-testid="login-password-input"
                      className="h-14"
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full h-14 text-lg font-semibold"
                    disabled={isLoading}
                    data-testid="login-submit-btn"
                  >
                    {isLoading ? t("loading") : t("login")}
                  </Button>
                </form>
              </TabsContent>
              
              <TabsContent value="register">
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="register-name">{t("name")}</Label>
                    <Input
                      id="register-name"
                      type="text"
                      placeholder="Max Mustermann"
                      value={registerData.name}
                      onChange={(e) => setRegisterData({ ...registerData, name: e.target.value })}
                      required
                      data-testid="register-name-input"
                      className="h-14"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-email">{t("email")}</Label>
                    <Input
                      id="register-email"
                      type="email"
                      placeholder="fahrer@example.com"
                      value={registerData.email}
                      onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                      required
                      data-testid="register-email-input"
                      className="h-14"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-password">{t("password")}</Label>
                    <Input
                      id="register-password"
                      type="password"
                      value={registerData.password}
                      onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                      required
                      data-testid="register-password-input"
                      className="h-14"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{i18n.language === "de" ? "Sprache" : "Language"}</Label>
                    <Select 
                      value={registerData.language} 
                      onValueChange={(val) => setRegisterData({ ...registerData, language: val })}
                    >
                      <SelectTrigger className="h-14" data-testid="register-language-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="de">Deutsch</SelectItem>
                        <SelectItem value="en">English</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{i18n.language === "de" ? "Kontotyp" : "Account Type"}</Label>
                    <Select 
                      value={registerData.role} 
                      onValueChange={(val) => setRegisterData({ ...registerData, role: val })}
                    >
                      <SelectTrigger className="h-14" data-testid="register-role-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="driver">
                          {i18n.language === "de" ? "Fahrer" : "Driver"}
                        </SelectItem>
                        <SelectItem value="manager">
                          {i18n.language === "de" ? "Flottenmanager" : "Fleet Manager"}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full h-14 text-lg font-semibold"
                    disabled={isLoading}
                    data-testid="register-submit-btn"
                  >
                    {isLoading ? t("loading") : t("register")}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LandingPage;
