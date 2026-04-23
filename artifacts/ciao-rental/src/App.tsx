import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { AdminLayout } from "@/components/layout/AdminLayout";

import { Home } from "@/pages/home";
import { CarsPage } from "@/pages/cars/index";
import { CarDetailPage } from "@/pages/cars/detail";
import { BookingSuccessPage } from "@/pages/booking/success";

import { AdminLogin } from "@/pages/admin/login";
import { AdminDashboard } from "@/pages/admin/dashboard";
import { AdminCars } from "@/pages/admin/cars";
import { AdminBookings } from "@/pages/admin/bookings";

const queryClient = new QueryClient();

function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-[100dvh]">
      <Navbar />
      <main className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}

function Router() {
  return (
    <Switch>
      {/* Public Routes */}
      <Route path="/" component={() => <MainLayout><Home /></MainLayout>} />
      <Route path="/cars" component={() => <MainLayout><CarsPage /></MainLayout>} />
      <Route path="/cars/:id" component={() => <MainLayout><CarDetailPage /></MainLayout>} />
      <Route path="/booking/success" component={() => <MainLayout><BookingSuccessPage /></MainLayout>} />
      
      {/* Admin Auth Route */}
      <Route path="/admin/login" component={AdminLogin} />
      
      {/* Protected Admin Routes */}
      <Route path="/admin/dashboard" component={() => <AdminLayout><AdminDashboard /></AdminLayout>} />
      <Route path="/admin/cars" component={() => <AdminLayout><AdminCars /></AdminLayout>} />
      <Route path="/admin/bookings" component={() => <AdminLayout><AdminBookings /></AdminLayout>} />
      
      <Route component={() => <MainLayout><NotFound /></MainLayout>} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;