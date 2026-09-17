import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/contexts/AuthContext";
import { SiteSettingsProvider } from "@/contexts/SiteSettingsContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

// Lazy-load layouts — they pull in heavy deps (framer-motion, supabase realtime,
// many lucide icons) that aren't needed for public pages like the homepage/login.
const AppLayout = lazy(() => import("@/components/AppLayout").then(m => ({ default: m.AppLayout })));
const UserLayout = lazy(() => import("@/components/UserLayout").then(m => ({ default: m.UserLayout })));

// Eagerly loaded (public/critical routes)
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

// Lazy loaded (large public pages — keeps initial bundle small)
const Homepage = lazy(() => import("./pages/Homepage"));
const Welcome = lazy(() => import("./pages/Welcome"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));

// Lazy loaded (authenticated user pages)
const UserDashboard = lazy(() => import("./pages/UserDashboard"));
const TransferPage = lazy(() => import("./pages/TransferPage"));
const DepositPage = lazy(() => import("./pages/DepositPage"));
const RedeemPage = lazy(() => import("./pages/RedeemPage"));
const WithdrawPage = lazy(() => import("./pages/WithdrawPage"));
const UserTransactions = lazy(() => import("./pages/UserTransactions"));
const UserPasswordRequests = lazy(() => import("./pages/UserPasswordRequests"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const Notifications = lazy(() => import("./pages/Notifications"));

// Lazy loaded (admin pages)
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const AdminOverview = lazy(() => import("./pages/AdminOverview"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const AdminGames = lazy(() => import("./pages/AdminGames"));
const AdminTransactions = lazy(() => import("./pages/AdminTransactions"));
const AdminPasswordRequests = lazy(() => import("./pages/AdminPasswordRequests"));
const AdminPaymentGateways = lazy(() => import("./pages/AdminPaymentGateways"));
const AdminSiteSettings = lazy(() => import("./pages/AdminSiteSettings"));
const AdminLandingPage = lazy(() => import("./pages/AdminLandingPage"));
const AdminEmailTemplates = lazy(() => import("./pages/AdminEmailTemplates"));
const AdminRewards = lazy(() => import("./pages/AdminRewards"));
const AdminGameAccessRequests = lazy(() => import("./pages/AdminGameAccessRequests"));
const AdminVerification = lazy(() => import("./pages/AdminVerification"));
const AdminWithdrawMethods = lazy(() => import("./pages/AdminWithdrawMethods"));
const AdminRedeemSettings = lazy(() => import("./pages/AdminRedeemSettings"));
const AdminSupportChannels = lazy(() => import("./pages/AdminSupportChannels"));
const AdminExportRequests = lazy(() => import("./pages/AdminExportRequests"));
const AdminActivityLog = lazy(() => import("./pages/AdminActivityLog"));
const AdminGameApiProviders = lazy(() => import("./pages/AdminGameApiProviders"));
const AdminBackups = lazy(() => import("./pages/AdminBackups"));
const AdminRlsDiagnostics = lazy(() => import("./pages/AdminRlsDiagnostics"));
const ManagerDashboard = lazy(() => import("./pages/ManagerDashboard"));
const LazyFallback = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);
const queryClient = new QueryClient();
const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <SiteSettingsProvider>
          <Suspense fallback={<LazyFallback />}>
          <Routes>
            <Route path="/" element={<Homepage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/welcome" element={<Welcome />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Protected user routes */}
            <Route path="/home" element={<ProtectedRoute><UserDashboard /></ProtectedRoute>} />
            <Route path="/transfer" element={<ProtectedRoute><TransferPage /></ProtectedRoute>} />
            <Route path="/deposit" element={<ProtectedRoute><DepositPage /></ProtectedRoute>} />
            <Route path="/redeem" element={<ProtectedRoute><RedeemPage /></ProtectedRoute>} />
            <Route path="/withdraw" element={<ProtectedRoute><WithdrawPage /></ProtectedRoute>} />
            <Route path="/transactions" element={<ProtectedRoute><UserLayout showBackButton><UserTransactions /></UserLayout></ProtectedRoute>} />
            <Route path="/password-requests" element={<ProtectedRoute><UserLayout showBackButton><UserPasswordRequests /></UserLayout></ProtectedRoute>} />
            <Route path="/notifications" element={<ProtectedRoute><UserLayout showBackButton><div className="mx-auto max-w-6xl px-4 py-8"><Notifications /></div></UserLayout></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><UserLayout showBackButton><div className="mx-auto max-w-6xl px-4 py-8"><SettingsPage /></div></UserLayout></ProtectedRoute>} />

            {/* Admin routes */}
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><AppLayout><AdminOverview /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/dashboard" element={<ProtectedRoute requiredRole="admin"><AppLayout><ManagerDashboard /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute requiredRole="admin"><AppLayout><AdminUsers /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/games" element={<ProtectedRoute requiredRole="admin"><AppLayout><AdminGames /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/transactions" element={<ProtectedRoute requiredRole="admin"><AppLayout><AdminTransactions /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/password-requests" element={<ProtectedRoute requiredRole="admin"><AppLayout><AdminPasswordRequests /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/payment-gateways" element={<ProtectedRoute requiredRole="admin"><AppLayout><AdminPaymentGateways /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/site-settings" element={<ProtectedRoute requiredRole="admin"><AppLayout><AdminSiteSettings /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/landing-page" element={<ProtectedRoute requiredRole="admin"><AppLayout><AdminLandingPage /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/email-templates" element={<ProtectedRoute requiredRole="admin"><AppLayout><AdminEmailTemplates /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/notifications" element={<ProtectedRoute requiredRole="admin"><AppLayout><Notifications isAdmin /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/rewards" element={<ProtectedRoute requiredRole="admin"><AppLayout><AdminRewards /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/game-access" element={<ProtectedRoute requiredRole="admin"><AppLayout><AdminGameAccessRequests /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/verification" element={<ProtectedRoute requiredRole="admin"><AppLayout><AdminVerification /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/withdraw-methods" element={<ProtectedRoute requiredRole="admin"><AppLayout><AdminWithdrawMethods /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/redeem-settings" element={<ProtectedRoute requiredRole="admin"><AppLayout><AdminRedeemSettings /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/support-channels" element={<ProtectedRoute requiredRole="admin"><AppLayout><AdminSupportChannels /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/export-requests" element={<ProtectedRoute requiredRole="admin"><AppLayout><AdminExportRequests /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/activity-log" element={<ProtectedRoute requiredRole="admin"><AppLayout><AdminActivityLog /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/game-api-providers" element={<ProtectedRoute requiredRole="admin"><AppLayout><AdminGameApiProviders /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/backups" element={<ProtectedRoute requiredRole="admin"><AppLayout><AdminBackups /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/rls-diagnostics" element={<ProtectedRoute requiredRole="admin"><AppLayout><AdminRlsDiagnostics /></AppLayout></ProtectedRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          
          </SiteSettingsProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
