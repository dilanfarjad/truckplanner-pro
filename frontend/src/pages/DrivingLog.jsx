import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth, API } from "@/App";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Calendar as CalendarIcon, 
  Plus, 
  Clock, 
  Coffee,
  FileText,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isToday, isSameMonth } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { cn } from "@/lib/utils";

const DrivingLog = () => {
  const { t, i18n } = useTranslation();
  const { token } = useAuth();
  
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isBreakDialogOpen, setIsBreakDialogOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);
  
  const [newLog, setNewLog] = useState({
    date: format(new Date(), "yyyy-MM-dd"),
    work_start: "",
    work_end: "",
    driving_start: "",
    driving_end: "",
    total_driving_minutes: 0,
    total_work_minutes: 0,
    breaks: []
  });

  const [newBreak, setNewBreak] = useState({
    start: "",
    end: "",
    break_type: "fahrtunterbrechung",
    duration_minutes: 45
  });

  const headers = { Authorization: `Bearer ${token}` };
  const locale = i18n.language === "de" ? de : enUS;

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const response = await axios.get(`${API}/driving-logs?days=56`, { headers });
      setLogs(response.data);
    } catch (error) {
      toast.error(t("error"));
    } finally {
      setLoading(false);
    }
  };

  const createLog = async () => {
    try {
      await axios.post(`${API}/driving-logs`, newLog, { headers });
      toast.success(t("success"));
      fetchLogs();
      setIsAddDialogOpen(false);
      resetNewLog();
    } catch (error) {
      toast.error(error.response?.data?.detail || t("error"));
    }
  };

  const addBreakToLog = async () => {
    if (!selectedLog) return;
    
    try {
      await axios.post(
        `${API}/driving-logs/${selectedLog.id}/breaks`,
        newBreak,
        { headers }
      );
      toast.success(t("success"));
      fetchLogs();
      setIsBreakDialogOpen(false);
      setNewBreak({
        start: "",
        end: "",
        break_type: "fahrtunterbrechung",
        duration_minutes: 45
      });
    } catch (error) {
      toast.error(t("error"));
    }
  };

  const resetNewLog = () => {
    setNewLog({
      date: format(new Date(), "yyyy-MM-dd"),
      work_start: "",
      work_end: "",
      driving_start: "",
      driving_end: "",
      total_driving_minutes: 0,
      total_work_minutes: 0,
      breaks: []
    });
  };

  const formatMinutes = (minutes) => {
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hrs}h ${mins}m`;
  };

  const getLogForDate = (date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return logs.find(log => log.date === dateStr);
  };

  const getDayStatus = (date) => {
    const log = getLogForDate(date);
    if (!log) return null;
    if (log.total_driving_minutes > 540) return "danger";
    if (log.total_driving_minutes > 450) return "warning";
    return "safe";
  };

  // Calendar days for current month
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const selectedDateLog = getLogForDate(selectedDate);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6" data-testid="driving-log">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl md:text-4xl font-bold tracking-tight">
            {t("drivingLog")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t("last56Days")} - EU VO 561/2006
          </p>
        </div>
        
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              size="lg" 
              className="h-14 px-8"
              data-testid="add-log-btn"
            >
              <Plus className="w-5 h-5 mr-2" />
              {t("add")} {t("drivingLog")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("add")} {t("drivingLog")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t("date")}</Label>
                <Input
                  type="date"
                  value={newLog.date}
                  onChange={(e) => setNewLog({ ...newLog, date: e.target.value })}
                  data-testid="log-date-input"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("workStart")}</Label>
                  <Input
                    type="time"
                    value={newLog.work_start}
                    onChange={(e) => setNewLog({ ...newLog, work_start: e.target.value })}
                    data-testid="work-start-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("workEnd")}</Label>
                  <Input
                    type="time"
                    value={newLog.work_end}
                    onChange={(e) => setNewLog({ ...newLog, work_end: e.target.value })}
                    data-testid="work-end-input"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("drivingStart")}</Label>
                  <Input
                    type="time"
                    value={newLog.driving_start}
                    onChange={(e) => setNewLog({ ...newLog, driving_start: e.target.value })}
                    data-testid="driving-start-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("drivingEnd")}</Label>
                  <Input
                    type="time"
                    value={newLog.driving_end}
                    onChange={(e) => setNewLog({ ...newLog, driving_end: e.target.value })}
                    data-testid="driving-end-input"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("totalDriving")} ({t("minutes")})</Label>
                  <Input
                    type="number"
                    value={newLog.total_driving_minutes}
                    onChange={(e) => setNewLog({ ...newLog, total_driving_minutes: parseInt(e.target.value) || 0 })}
                    data-testid="total-driving-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("totalWork")} ({t("minutes")})</Label>
                  <Input
                    type="number"
                    value={newLog.total_work_minutes}
                    onChange={(e) => setNewLog({ ...newLog, total_work_minutes: parseInt(e.target.value) || 0 })}
                    data-testid="total-work-input"
                  />
                </div>
              </div>

              <Button 
                onClick={createLog} 
                className="w-full h-12"
                data-testid="save-log-btn"
              >
                {t("save")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar View */}
        <Card className="bg-card border-border lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">{t("date")}</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={prevMonth}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="font-medium min-w-[120px] text-center">
                {format(currentMonth, "MMMM yyyy", { locale })}
              </span>
              <Button variant="ghost" size="icon" onClick={nextMonth}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1">
              {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((day) => (
                <div key={day} className="text-center text-xs text-muted-foreground py-2">
                  {day}
                </div>
              ))}
              
              {/* Empty cells for days before month start */}
              {Array.from({ length: (monthStart.getDay() + 6) % 7 }).map((_, i) => (
                <div key={`empty-${i}`} className="h-10" />
              ))}
              
              {monthDays.map((day) => {
                const status = getDayStatus(day);
                const isSelected = format(day, "yyyy-MM-dd") === format(selectedDate, "yyyy-MM-dd");
                
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDate(day)}
                    className={cn(
                      "h-10 w-full rounded-lg text-sm font-medium transition-all",
                      isToday(day) && "ring-2 ring-primary",
                      isSelected && "bg-primary text-primary-foreground",
                      !isSelected && status === "safe" && "bg-secondary/20 text-secondary",
                      !isSelected && status === "warning" && "bg-warning/20 text-warning",
                      !isSelected && status === "danger" && "bg-destructive/20 text-destructive",
                      !isSelected && !status && "hover:bg-accent"
                    )}
                    data-testid={`calendar-day-${format(day, "yyyy-MM-dd")}`}
                  >
                    {format(day, "d")}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-secondary/40" />
                <span>&lt; 7.5h</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-warning/40" />
                <span>&gt; 7.5h</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-destructive/40" />
                <span>&gt; 9h</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Selected Day Details */}
        <Card className="bg-card border-border lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-primary" />
              {format(selectedDate, "EEEE, d. MMMM yyyy", { locale })}
            </CardTitle>
            {selectedDateLog && (
              <Dialog open={isBreakDialogOpen} onOpenChange={setIsBreakDialogOpen}>
                <DialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setSelectedLog(selectedDateLog)}
                    data-testid="add-break-btn"
                  >
                    <Coffee className="w-4 h-4 mr-2" />
                    {t("addBreak")}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("addBreak")}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Start</Label>
                        <Input
                          type="time"
                          value={newBreak.start}
                          onChange={(e) => setNewBreak({ ...newBreak, start: e.target.value })}
                          data-testid="break-start-input"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Ende</Label>
                        <Input
                          type="time"
                          value={newBreak.end}
                          onChange={(e) => setNewBreak({ ...newBreak, end: e.target.value })}
                          data-testid="break-end-input"
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>{t("breakType")}</Label>
                      <Select
                        value={newBreak.break_type}
                        onValueChange={(val) => setNewBreak({ ...newBreak, break_type: val })}
                      >
                        <SelectTrigger data-testid="break-type-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fahrtunterbrechung">{t("fahrtunterbrechung")}</SelectItem>
                          <SelectItem value="pause">{t("pause")}</SelectItem>
                          <SelectItem value="ruhezeit">{t("ruhezeit")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Dauer ({t("minutes")})</Label>
                      <Input
                        type="number"
                        value={newBreak.duration_minutes}
                        onChange={(e) => setNewBreak({ ...newBreak, duration_minutes: parseInt(e.target.value) || 0 })}
                        data-testid="break-duration-input"
                      />
                      <div className="flex gap-2 mt-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setNewBreak({ ...newBreak, duration_minutes: 15 })}
                        >
                          15 min
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setNewBreak({ ...newBreak, duration_minutes: 30 })}
                        >
                          30 min
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setNewBreak({ ...newBreak, duration_minutes: 45 })}
                        >
                          45 min
                        </Button>
                      </div>
                    </div>

                    <Button 
                      onClick={addBreakToLog} 
                      className="w-full h-12"
                      data-testid="save-break-btn"
                    >
                      {t("save")}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </CardHeader>
          <CardContent>
            {selectedDateLog ? (
              <div className="space-y-6">
                {/* Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground uppercase">{t("workStart")}</p>
                    <p className="font-mono text-lg">{selectedDateLog.work_start || "-"}</p>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground uppercase">{t("workEnd")}</p>
                    <p className="font-mono text-lg">{selectedDateLog.work_end || "-"}</p>
                  </div>
                  <div className="p-4 bg-primary/10 rounded-lg">
                    <p className="text-xs text-muted-foreground uppercase">{t("totalDriving")}</p>
                    <p className="font-mono text-lg text-primary">
                      {formatMinutes(selectedDateLog.total_driving_minutes)}
                    </p>
                  </div>
                  <div className="p-4 bg-secondary/10 rounded-lg">
                    <p className="text-xs text-muted-foreground uppercase">{t("totalWork")}</p>
                    <p className="font-mono text-lg text-secondary">
                      {formatMinutes(selectedDateLog.total_work_minutes)}
                    </p>
                  </div>
                </div>

                {/* Breaks */}
                {selectedDateLog.breaks?.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-3">{t("breaks")}</h4>
                    <div className="space-y-2">
                      {selectedDateLog.breaks.map((brk, idx) => (
                        <div 
                          key={idx}
                          className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <Coffee className="w-4 h-4 text-primary" />
                            <span className="font-mono text-sm">
                              {brk.start} - {brk.end}
                            </span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-sm text-muted-foreground">
                              {t(brk.break_type)}
                            </span>
                            <span className="font-mono text-sm">
                              {brk.duration_minutes} min
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">{t("noData")}</p>
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => {
                    setNewLog({ ...newLog, date: format(selectedDate, "yyyy-MM-dd") });
                    setIsAddDialogOpen(true);
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Eintrag erstellen
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Logs Table */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg">{t("last56Days")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("date")}</TableHead>
                  <TableHead>{t("workStart")}</TableHead>
                  <TableHead>{t("workEnd")}</TableHead>
                  <TableHead className="text-right">{t("totalDriving")}</TableHead>
                  <TableHead className="text-right">{t("totalWork")}</TableHead>
                  <TableHead className="text-right">{t("breaks")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow 
                    key={log.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedDate(parseISO(log.date))}
                    data-testid={`log-row-${log.date}`}
                  >
                    <TableCell className="font-mono">
                      {format(parseISO(log.date), "dd.MM.yyyy")}
                    </TableCell>
                    <TableCell className="font-mono">{log.work_start || "-"}</TableCell>
                    <TableCell className="font-mono">{log.work_end || "-"}</TableCell>
                    <TableCell className={cn(
                      "text-right font-mono",
                      log.total_driving_minutes > 540 && "text-destructive",
                      log.total_driving_minutes > 450 && log.total_driving_minutes <= 540 && "text-warning"
                    )}>
                      {formatMinutes(log.total_driving_minutes)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatMinutes(log.total_work_minutes)}
                    </TableCell>
                    <TableCell className="text-right">
                      {log.breaks?.length || 0}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

export default DrivingLog;
