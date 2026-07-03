import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { AdminLayout } from "@/components/layout/AdminLayout";

import { Home } from "@/pages/home";
import { RentalCarHome } from "@/pages/rentalcar/index";
import { CarsPage } from "@/pages/rentalcar/cars/index";
import { CarDetailPage } from "@/pages/rentalcar/cars/detail";
import { BookingSuccessPage } from "@/pages/rentalcar/booking/success";

import { AdminLogin } from "@/pages/admin/login";
import { AdminDashboard } from "@/pages/admin/dashboard";
import { AdminFleet } from "@/pages/admin/fleet";
import { AdminBookings } from "@/pages/admin/bookings";
import { AdminContent } from "@/pages/admin/content";
import { AdminSeo } from "@/pages/admin/seo";

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
      <Route path="/rentalcar" component={() => <MainLayout><RentalCarHome /></MainLayout>} />
      <Route path="/rentalcar/cars" component={() => <MainLayout><CarsPage /></MainLayout>} />
      <Route path="/rentalcar/cars/:id" component={() => <MainLayout><CarDetailPage /></MainLayout>} />
      <Route path="/rentalcar/booking/success" component={() => <MainLayout><BookingSuccessPage /></MainLayout>} />

      {/* Admin Auth Route */}
      <Route path="/admin/login" component={AdminLogin} />

      {/* Protected Admin Routes */}
      <Route path="/admin/dashboard" component={() => <AdminLayout><AdminDashboard /></AdminLayout>} />
      <Route path="/admin/fleet" component={() => <AdminLayout><AdminFleet /></AdminLayout>} />
      <Route path="/admin/bookings" component={() => <AdminLayout><AdminBookings /></AdminLayout>} />
      <Route path="/admin/content" component={() => <AdminLayout><AdminContent /></AdminLayout>} />
      <Route path="/admin/seo" component={() => <AdminLayout><AdminSeo /></AdminLayout>} />

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
