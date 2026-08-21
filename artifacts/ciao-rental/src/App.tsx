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
import { CheckoutPage } from "@/pages/rentalcar/checkout/index";
import { BookingSuccessPage } from "@/pages/rentalcar/booking/success";
import { LodgingPage } from "@/pages/lodging/index";
import { LodgingDetailPage } from "@/pages/lodging/detail";
import { MyBookings } from "@/pages/rentalcar/my-bookings/index";
import { MyBookingDetail } from "@/pages/rentalcar/my-bookings/detail";

import { AdminLogin } from "@/pages/admin/login";
import { AdminDashboard } from "@/pages/admin/dashboard";
import { AdminFleet } from "@/pages/admin/fleet";
import { AdminBookings } from "@/pages/admin/bookings";
import { AdminContent } from "@/pages/admin/content";
import { AdminSeo } from "@/pages/admin/seo";
import { AdminLodging } from "@/pages/admin/lodging";
import { AdminRentalCars } from "@/pages/admin/rental-cars/index";
import { AdminRentalCarEdit } from "@/pages/admin/rental-cars/edit";
import { AdminRentalAvailability } from "@/pages/admin/rental-cars/availability";
import { AdminRentalDashboard } from "@/pages/admin/rental-cars/dashboard";
import { AdminReservations } from "@/pages/admin/rental-cars/reservations/index";
import { AdminReservationDetail } from "@/pages/admin/rental-cars/reservations/detail";
import { AdminReservationPickup } from "@/pages/admin/rental-cars/reservations/pickup";
import { AdminReservationReturn } from "@/pages/admin/rental-cars/reservations/return";
import { AdminMaintenance } from "@/pages/admin/rental-cars/maintenance";
import { AdminAddons } from "@/pages/admin/rental-cars/addons";
import { AdminPricingRules } from "@/pages/admin/rental-cars/pricing";
import { AdminSettings } from "@/pages/admin/rental-cars/settings";
import { AdminAudit } from "@/pages/admin/rental-cars/audit";

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
      <Route path="/rentalcar/cars/:slug" component={() => <MainLayout><CarDetailPage /></MainLayout>} />
      <Route path="/rentalcar/checkout" component={() => <MainLayout><CheckoutPage /></MainLayout>} />
      <Route path="/rentalcar/booking/confirmation" component={() => <MainLayout><BookingSuccessPage /></MainLayout>} />
      <Route path="/rentalcar/booking/success" component={() => <MainLayout><BookingSuccessPage /></MainLayout>} />
      <Route path="/rentalcar/my-bookings" component={() => <MainLayout><MyBookings /></MainLayout>} />
      <Route path="/rentalcar/my-bookings/:id" component={() => <MainLayout><MyBookingDetail /></MainLayout>} />
      <Route path="/lodging" component={() => <MainLayout><LodgingPage /></MainLayout>} />
      <Route path="/lodging/:slug" component={() => <MainLayout><LodgingDetailPage /></MainLayout>} />

      {/* Admin Auth Route */}
      <Route path="/admin/login" component={AdminLogin} />

      {/* Protected Admin Routes */}
      <Route path="/admin/dashboard" component={() => <AdminLayout><AdminDashboard /></AdminLayout>} />
      <Route path="/admin/fleet" component={() => <AdminLayout><AdminFleet /></AdminLayout>} />
      <Route path="/admin/lodging" component={() => <AdminLayout><AdminLodging /></AdminLayout>} />
      <Route path="/admin/bookings" component={() => <AdminLayout><AdminBookings /></AdminLayout>} />
      <Route path="/admin/content" component={() => <AdminLayout><AdminContent /></AdminLayout>} />
      <Route path="/admin/seo" component={() => <AdminLayout><AdminSeo /></AdminLayout>} />

      {/* Rental Cars Admin */}
      <Route path="/admin/rental-cars/dashboard" component={() => <AdminLayout><AdminRentalDashboard /></AdminLayout>} />
      <Route path="/admin/rental-cars/new" component={() => <AdminLayout><AdminRentalCarEdit isNew /></AdminLayout>} />
      <Route path="/admin/rental-cars/:id/edit" component={() => <AdminLayout><AdminRentalCarEdit /></AdminLayout>} />
      <Route path="/admin/rental-cars/availability" component={() => <AdminLayout><AdminRentalAvailability /></AdminLayout>} />
      <Route path="/admin/rental-cars/reservations" component={() => <AdminLayout><AdminReservations /></AdminLayout>} />
      <Route path="/admin/rental-cars/reservations/:id" component={() => <AdminLayout><AdminReservationDetail /></AdminLayout>} />
      <Route path="/admin/rental-cars/reservations/:id/pickup" component={() => <AdminLayout><AdminReservationPickup /></AdminLayout>} />
      <Route path="/admin/rental-cars/reservations/:id/return" component={() => <AdminLayout><AdminReservationReturn /></AdminLayout>} />
      <Route path="/admin/rental-car-reservations/:id/pickup" component={() => <AdminLayout><AdminReservationPickup /></AdminLayout>} />
      <Route path="/admin/rental-car-reservations/:id/return" component={() => <AdminLayout><AdminReservationReturn /></AdminLayout>} />
      <Route path="/admin/rental-car-reservations/:id" component={() => <AdminLayout><AdminReservationDetail /></AdminLayout>} />
      <Route path="/admin/rental-car-reservations" component={() => <AdminLayout><AdminReservations /></AdminLayout>} />
      <Route path="/admin/rental-cars/maintenance" component={() => <AdminLayout><AdminMaintenance /></AdminLayout>} />
      <Route path="/admin/rental-cars/addons" component={() => <AdminLayout><AdminAddons /></AdminLayout>} />
      <Route path="/admin/rental-cars/pricing" component={() => <AdminLayout><AdminPricingRules /></AdminLayout>} />
      <Route path="/admin/rental-cars/settings" component={() => <AdminLayout><AdminSettings /></AdminLayout>} />
      <Route path="/admin/rental-cars/audit" component={() => <AdminLayout><AdminAudit /></AdminLayout>} />
      <Route path="/admin/rental-cars" component={() => <AdminLayout><AdminRentalCars /></AdminLayout>} />

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
