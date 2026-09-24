import { useAdminRentalDashboard } from "@/hooks/use-rental-operations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Car, ClipboardList, JapaneseYen, CalendarRange, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function AdminRentalDashboard() {
  const { data: stats, isLoading } = useAdminRentalDashboard();

  if (isLoading) return <div className="p-8 text-center min-h-[60vh] flex items-center justify-center">Loading dashboard...</div>;
  if (!stats) return <div className="p-8 text-center text-muted-foreground min-h-[60vh] flex items-center justify-center">No data available.</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 animate-in fade-in zoom-in duration-500">
      <div>
        <h1 className="text-3xl font-serif font-bold text-primary">Rental Operations Dashboard</h1>
        <p className="text-muted-foreground">Overview of current fleet and bookings status.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="hover-elevate shadow-sm border-t-4 border-t-primary transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Vehicles</CardTitle>
            <div className="p-2 bg-primary/10 rounded-full text-primary"><Car className="w-4 h-4" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono text-primary">{stats.activeVehicles || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">{stats.totalVehicles || 0} total fleet</p>
          </CardContent>
        </Card>
        
        <Card className="hover-elevate shadow-sm border-t-4 border-t-secondary transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Today's Pickups</CardTitle>
            <div className="p-2 bg-secondary/10 rounded-full text-secondary"><CalendarRange className="w-4 h-4" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono text-secondary">{stats.todayPickups || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Scheduled for today</p>
          </CardContent>
        </Card>

        <Card className="hover-elevate shadow-sm border-t-4 border-t-accent transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Bookings</CardTitle>
            <div className="p-2 bg-accent/10 rounded-full text-accent"><ClipboardList className="w-4 h-4" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono text-accent">{stats.pendingReservations || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Requires confirmation</p>
          </CardContent>
        </Card>

        <Card className="hover-elevate shadow-sm border-t-4 border-t-primary/50 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">MTD Revenue</CardTitle>
            <div className="p-2 bg-muted rounded-full"><JapaneseYen className="w-4 h-4" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">¥{Number(stats.mtdRevenue || 0).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Month to date</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 shadow-sm border border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Clock className="w-5 h-5 text-primary" /> Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.recentActivity && stats.recentActivity.length > 0 ? (
              <div className="space-y-4">
                {stats.recentActivity.map((activity: any, i: number) => (
                  <div key={i} className="flex justify-between items-start pb-4 border-b last:border-0 last:pb-0 hover:bg-muted/30 p-2 -mx-2 rounded-md transition-colors">
                    <div>
                      <p className="font-medium text-sm">{activity.title}</p>
                      <p className="text-sm text-muted-foreground">{activity.description}</p>
                    </div>
                    <Badge variant="outline" className="text-xs bg-background whitespace-nowrap">{activity.time}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground border-2 border-dashed border-muted rounded-lg">
                No recent activity.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm border border-border bg-gradient-to-br from-card to-muted/20">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <a href="/admin/rental-cars/reservations" className="block p-3 rounded-lg border bg-card hover:border-primary hover:shadow-md transition-all text-sm font-medium flex justify-between items-center group">
              View All Reservations
              <span className="text-primary group-hover:translate-x-1 transition-transform">→</span>
            </a>
            <a href="/admin/rental-cars/availability" className="block p-3 rounded-lg border bg-card hover:border-primary hover:shadow-md transition-all text-sm font-medium flex justify-between items-center group">
              Manage Fleet Availability
              <span className="text-primary group-hover:translate-x-1 transition-transform">→</span>
            </a>
            <a href="/admin/rental-cars/maintenance" className="block p-3 rounded-lg border bg-card hover:border-primary hover:shadow-md transition-all text-sm font-medium flex justify-between items-center group">
              Record Maintenance
              <span className="text-primary group-hover:translate-x-1 transition-transform">→</span>
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
