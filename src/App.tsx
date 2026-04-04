import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OfflineRetryBanner } from "@/components/global/OfflineRetryBanner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { SidebarProvider } from "@/hooks/useSidebarState";
import { CartProvider } from "@/hooks/useCart";
import { Loader2 } from "lucide-react";
import React, { Suspense, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Only eagerly load the landing page (Marketplace) and Auth
import Marketplace from "./pages/Marketplace";
import Auth from "./pages/Auth";

// Lazy load everything else
const Dashboard = React.lazy(() => import("./pages/Dashboard"));
const Products = React.lazy(() => import("./pages/Products"));
const RoleDetail = React.lazy(() => import("./pages/RoleDetail"));
const TransportRoleDetail = React.lazy(() => import("./pages/TransportRoleDetail"));
const ManufacturingRoleDetail = React.lazy(() => import("./pages/ManufacturingRoleDetail"));
const EducationCategory = React.lazy(() => import("./pages/EducationCategory"));
const Keys = React.lazy(() => import("./pages/Keys"));
const Servers = React.lazy(() => import("./pages/Servers"));
const ServerAdd = React.lazy(() => import("./pages/ServerAdd"));
const ServerDetail = React.lazy(() => import("./pages/ServerDetail"));
const ServerLogsPage = React.lazy(() => import("./pages/ServerLogsPage"));
const ServerDeployPage = React.lazy(() => import("./pages/ServerDeployPage"));
const ServerDnsPage = React.lazy(() => import("./pages/ServerDnsPage"));
const ServerGitPage = React.lazy(() => import("./pages/ServerGitPage"));
const ServerSettingsPage = React.lazy(() => import("./pages/ServerSettingsPage"));
const AiChat = React.lazy(() => import("./pages/AiChat"));
const ValaBuilder = React.lazy(() => import("./pages/ValaBuilder"));
const SaasAiDashboard = React.lazy(() => import("./pages/SaasAiDashboard"));
const AiApis = React.lazy(() => import("./pages/AiApis"));
const Wallet = React.lazy(() => import("./pages/Wallet"));
const SeoLeads = React.lazy(() => import("./pages/SeoLeads"));
const Resellers = React.lazy(() => import("./pages/Resellers"));
const Settings = React.lazy(() => import("./pages/Settings"));
const AuditLogs = React.lazy(() => import("./pages/AuditLogs"));
const SystemHealth = React.lazy(() => import("./pages/SystemHealth"));
const Onboarding = React.lazy(() => import("./pages/Onboarding"));
const Support = React.lazy(() => import("./pages/Support"));
const SupportTicket = React.lazy(() => import("./pages/SupportTicket"));
const Feedback = React.lazy(() => import("./pages/Feedback"));
const Announcements = React.lazy(() => import("./pages/Announcements"));
const Downloads = React.lazy(() => import("./pages/Downloads"));
const EmailLogs = React.lazy(() => import("./pages/EmailLogs"));
const RetryActions = React.lazy(() => import("./pages/RetryActions"));
const ArchiveManager = React.lazy(() => import("./pages/ArchiveManager"));
const BulkActions = React.lazy(() => import("./pages/BulkActions"));
const Tags = React.lazy(() => import("./pages/Tags"));
const NotFound = React.lazy(() => import("./pages/NotFound"));
const ResellerDashboard = React.lazy(() => import("./pages/ResellerDashboard"));
const Automation = React.lazy(() => import("./pages/Automation"));
const AddProduct = React.lazy(() => import("./pages/AddProduct"));
const EduPwa = React.lazy(() => import("./pages/EduPwa"));
const Install = React.lazy(() => import("./pages/Install"));
const HealthPwa = React.lazy(() => import("./pages/HealthPwa"));
const RealEstatePwa = React.lazy(() => import("./pages/RealEstatePwa"));
const EcomPwa = React.lazy(() => import("./pages/EcomPwa"));
const RetailPwa = React.lazy(() => import("./pages/RetailPwa"));
const FoodPwa = React.lazy(() => import("./pages/FoodPwa"));
const HospitalityPwa = React.lazy(() => import("./pages/HospitalityPwa"));
const TransportPwa = React.lazy(() => import("./pages/TransportPwa"));
const LogisticsPwa = React.lazy(() => import("./pages/LogisticsPwa"));
const FinancePwa = React.lazy(() => import("./pages/FinancePwa"));
const MediaPwa = React.lazy(() => import("./pages/MediaPwa"));
const SocialPwa = React.lazy(() => import("./pages/SocialPwa"));
const AiToolsPwa = React.lazy(() => import("./pages/AiToolsPwa"));
const DevToolsPwa = React.lazy(() => import("./pages/DevToolsPwa"));
const ProductivityPwa = React.lazy(() => import("./pages/ProductivityPwa"));
const CyberSecurityPwa = React.lazy(() => import("./pages/CyberSecurityPwa"));
const InvestPwa = React.lazy(() => import("./pages/InvestPwa"));
const ManufacturingPwa = React.lazy(() => import("./pages/ManufacturingPwa"));
const ConstructionPwa = React.lazy(() => import("./pages/ConstructionPwa"));
const AutomotivePwa = React.lazy(() => import("./pages/AutomotivePwa"));
const AgriculturePwa = React.lazy(() => import("./pages/AgriculturePwa"));
const EnergyPwa = React.lazy(() => import("./pages/EnergyPwa"));
const TelecomPwa = React.lazy(() => import("./pages/TelecomPwa"));
const ItSoftwarePwa = React.lazy(() => import("./pages/ItSoftwarePwa"));
const CloudDevopsPwa = React.lazy(() => import("./pages/CloudDevopsPwa"));
const AnalyticsPwa = React.lazy(() => import("./pages/AnalyticsPwa"));
const Cart = React.lazy(() => import("./pages/Cart"));
const OfflineAppTemplate = React.lazy(() => import("./pages/OfflineAppTemplate"));
const MarketplaceAdmin = React.lazy(() => import("./pages/MarketplaceAdmin"));
const CategoryFlow = React.lazy(() => import("./pages/CategoryFlow"));
const ProductDetail = React.lazy(() => import("./pages/ProductDetail"));
const Checkout = React.lazy(() => import("./pages/Checkout"));
const Success = React.lazy(() => import("./pages/Success"));
const Subscription = React.lazy(() => import("./pages/Subscription"));
const AppAccess = React.lazy(() => import("./pages/AppAccess"));
const Logout = React.lazy(() => import("./pages/Logout"));

const queryClient = new QueryClient();

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}

function SubscriptionGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { id, productId } = useParams();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      if (!user?.id) {
        if (mounted) {
          setAllowed(false);
          setChecking(false);
        }
        return;
      }

      const routeProductId = productId || id;
      let subscriptionQuery = supabase
        .from('subscriptions')
        .select('status,current_period_end,product_id')
        .eq('user_id', user.id);

      if (routeProductId) {
        subscriptionQuery = subscriptionQuery.or(`product_id.eq.${routeProductId},product_id.is.null`);
      }

      const subscriptionPromise = subscriptionQuery.limit(50);
      let orderQuery = supabase
        .from('marketplace_orders')
        .select('status,product_id')
        .eq('user_id', user.id)
        .in('status', ['completed', 'success']);
      if (routeProductId) {
        orderQuery = orderQuery.eq('product_id', routeProductId);
      }
      let licenseQuery = supabase
        .from('license_keys')
        .select('status,expires_at,product_id')
        .eq('created_by', user.id)
        .eq('status', 'active');
      if (routeProductId) {
        licenseQuery = licenseQuery.eq('product_id', routeProductId);
      }

      const [{ data: subs }, { data: orders }, { data: licenses }] = await Promise.all([
        subscriptionPromise,
        orderQuery.limit(50),
        licenseQuery.limit(50),
      ]);

      const hasActiveSubscription = (subs || []).some((row) => {
        const status = String(row.status || '').toLowerCase();
        const notExpired = !row.current_period_end || new Date(row.current_period_end) > new Date();
        return (status === 'active' || status === 'trialing') && notExpired;
      });
      const hasCompletedOrder = (orders || []).some((row) => {
        const status = String(row.status || '').toLowerCase();
        return status === 'completed' || status === 'success';
      });
      const hasActiveLicense = (licenses || []).some((row) => {
        const notExpired = !row.expires_at || new Date(row.expires_at) > new Date();
        return String(row.status || '').toLowerCase() === 'active' && notExpired;
      });

      if (mounted) {
        setAllowed(hasActiveSubscription || hasCompletedOrder || hasActiveLicense);
        setChecking(false);
      }
    };

    run();
    return () => {
      mounted = false;
    };
  }, [user?.id, productId, id]);

  if (loading || checking) return <PageLoader />;
  if (!user) return <Navigate to="/auth" replace />;
  if (!allowed) return <Navigate to="/subscription" replace />;
  return <>{children}</>;
}

function RoleGuard({ children, role }: { children: React.ReactNode; role: 'super_admin' | 'reseller' }) {
  if (role === 'super_admin') return <AdminRoute>{children}</AdminRoute>;
  return <ResellerRoute>{children}</ResellerRoute>;
}

const ADMIN_MASTER_ROUTES = new Set([
  '/admin/dashboard',
  '/admin/products',
  '/admin/keys',
  '/admin/servers',
  '/admin/wallet',
  '/admin/resellers',
  '/admin/marketplace',
  '/admin/apk-pipeline',
  '/admin/audit-logs',
]);
const ADMIN_DYNAMIC_PREFIXES = ['/admin/marketplace/'] as const;

function isValidAdminRoute(route: string) {
  if (ADMIN_MASTER_ROUTES.has(route)) return true;
  if (ADMIN_DYNAMIC_PREFIXES.some((prefix) => route.startsWith(prefix))) return true;
  return false;
}

function createRouteGuard(route: string, hasUser: boolean, allow: boolean) {
  if (!isValidAdminRoute(route)) return <Navigate to="/" replace />;
  if (!hasUser) return <Navigate to="/login" replace />;
  if (!allow) return <Navigate to="/unauthorized" replace />;
  return null;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isSuperAdmin, loading, user } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (location.pathname.startsWith('/admin')) {
    const guardResult = createRouteGuard(location.pathname, !!user, isSuperAdmin);
    if (guardResult) return guardResult;
  }
  return <>{children}</>;
}

function ResellerRoute({ children }: { children: React.ReactNode }) {
  const { isReseller, loading, user } = useAuth();
  const [statusLoading, setStatusLoading] = useState(true);
  const [isSuspended, setIsSuspended] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadResellerStatus = async () => {
      if (!user?.id || !isReseller) {
        if (mounted) {
          setIsSuspended(false);
          setStatusLoading(false);
        }
        return;
      }
      setStatusLoading(true);
      const { data } = await supabase
        .from('resellers')
        .select('is_active,status')
        .eq('user_id', user.id)
        .maybeSingle();
      if (mounted) {
        const suspended = !!data && (data.is_active === false || data.status === 'suspended' || data.status === 'inactive');
        setIsSuspended(suspended);
        setStatusLoading(false);
      }
    };
    loadResellerStatus();
    return () => {
      mounted = false;
    };
  }, [user?.id, isReseller]);

  if (loading) return <PageLoader />;
  if (statusLoading) return <PageLoader />;
  if (!isReseller) return <Navigate to="/unauthorized" replace />;
  if (isSuspended) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function ReferralRedirect() {
  const { code } = useParams();
  const ref = code ? encodeURIComponent(code) : '';
  return <Navigate to={ref ? `/auth?ref=${ref}` : '/auth'} replace />;
}

function ChatIdRedirect() {
  const { id } = useParams();
  const chatId = id ? encodeURIComponent(id) : '';
  return <Navigate to={chatId ? `/ai-chat?chat=${chatId}` : '/ai-chat'} replace />;
}

const SAFE_ROUTE_PARAM = /^[a-zA-Z0-9_-]+$/;

function hasInvalidRouteParam(params: Array<string | undefined>) {
  return params.some((param) => !!param && !SAFE_ROUTE_PARAM.test(param));
}

function CategoryRouteGuarded() {
  const { macro, sub, micro } = useParams();
  if (hasInvalidRouteParam([macro, sub, micro])) {
    return <Navigate to="/marketplace" replace />;
  }
  return <CategoryFlow />;
}

function ProductRouteGuarded() {
  const { id, productId } = useParams();
  const resolved = id || productId;
  if (!resolved || hasInvalidRouteParam([resolved])) {
    return <Navigate to="/marketplace" replace />;
  }
  return <ProductDetail />;
}

function AppRouteGuarded() {
  const { id, productId } = useParams();
  const resolved = id || productId;
  if (!resolved || hasInvalidRouteParam([resolved])) {
    return <Navigate to="/marketplace" replace />;
  }
  return (
    <AuthGuard>
      <SubscriptionGuard>
        <AppAccess />
      </SubscriptionGuard>
    </AuthGuard>
  );
}

function ProductEditRouteGuarded() {
  const { id } = useParams();
  if (!id || hasInvalidRouteParam([id])) {
    return <Navigate to="/dashboard" replace />;
  }
  return (
    <AuthGuard>
      <RoleGuard role="super_admin">
        <Navigate to="/admin/add-product" replace />
      </RoleGuard>
    </AuthGuard>
  );
}

function AppRoutes() {
  const { user } = useAuth();
  const setupDone = user?.id ? localStorage.getItem(`sv_onboarding_done_${user.id}`) === '1' : true;

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/login" element={<Navigate to="/auth" replace />} />
        <Route path="/signup" element={<Navigate to="/auth" replace />} />
        <Route path="/auth/login" element={<Navigate to="/auth" replace />} />
        <Route path="/ref/:code" element={<ReferralRedirect />} />
        <Route path="/" element={<Marketplace />} />
        <Route path="/marketplace" element={<Marketplace />} />
        <Route path="/search" element={<Marketplace />} />

        {/* Public lazy routes */}
        <Route path="/edu-pwa" element={<EduPwa />} />
        <Route path="/install" element={<Install />} />
        <Route path="/health-pwa" element={<HealthPwa />} />
        <Route path="/realestate-pwa" element={<RealEstatePwa />} />
        <Route path="/ecom-pwa" element={<EcomPwa />} />
        <Route path="/retail-pwa" element={<RetailPwa />} />
        <Route path="/food-pwa" element={<FoodPwa />} />
        <Route path="/hospitality-pwa" element={<HospitalityPwa />} />
        <Route path="/transport-pwa" element={<TransportPwa />} />
        <Route path="/logistics-pwa" element={<LogisticsPwa />} />
        <Route path="/finance-pwa" element={<FinancePwa />} />
        <Route path="/media-pwa" element={<MediaPwa />} />
        <Route path="/social-pwa" element={<SocialPwa />} />
        <Route path="/ai-tools-pwa" element={<AiToolsPwa />} />
        <Route path="/devtools-pwa" element={<DevToolsPwa />} />
        <Route path="/productivity-pwa" element={<ProductivityPwa />} />
        <Route path="/cybersecurity-pwa" element={<CyberSecurityPwa />} />
        <Route path="/invest-pwa" element={<InvestPwa />} />
        <Route path="/manufacturing-pwa" element={<ManufacturingPwa />} />
        <Route path="/construction-pwa" element={<ConstructionPwa />} />
        <Route path="/automotive-pwa" element={<AutomotivePwa />} />
        <Route path="/agriculture-pwa" element={<AgriculturePwa />} />
        <Route path="/energy-pwa" element={<EnergyPwa />} />
        <Route path="/telecom-pwa" element={<TelecomPwa />} />
        <Route path="/it-software-pwa" element={<ItSoftwarePwa />} />
        <Route path="/cloud-devops-pwa" element={<CloudDevopsPwa />} />
        <Route path="/analytics-pwa" element={<AnalyticsPwa />} />
        <Route path="/cart" element={<AuthGuard><Cart /></AuthGuard>} />
        <Route path="/offline-app" element={<OfflineAppTemplate />} />
        <Route path="/category/:macro" element={<CategoryRouteGuarded />} />
        <Route path="/category/:macro/:sub" element={<CategoryRouteGuarded />} />
        <Route path="/category/:macro/:sub/:micro" element={<CategoryRouteGuarded />} />
        <Route path="/product/:id" element={<ProductRouteGuarded />} />
        <Route path="/product/:productId" element={<ProductRouteGuarded />} />


        {/* Protected routes */}
        <Route path="/onboarding" element={<AuthGuard><Onboarding /></AuthGuard>} />
        <Route path="/dashboard" element={<AuthGuard>{setupDone ? <Dashboard /> : <Navigate to="/onboarding" replace />}</AuthGuard>} />
        <Route path="/admin/dashboard" element={<AuthGuard><RoleGuard role="super_admin"><Dashboard /></RoleGuard></AuthGuard>} />
        <Route path="/support" element={<AuthGuard><Support /></AuthGuard>} />
        <Route path="/support/ticket" element={<AuthGuard><SupportTicket /></AuthGuard>} />
        <Route path="/feedback" element={<AuthGuard><Feedback /></AuthGuard>} />
        <Route path="/announcements" element={<AuthGuard><Announcements /></AuthGuard>} />
        <Route path="/dashboard/downloads" element={<AuthGuard><Downloads /></AuthGuard>} />
        <Route path="/email-logs" element={<AuthGuard><RoleGuard role="super_admin"><EmailLogs /></RoleGuard></AuthGuard>} />
        <Route path="/retry-actions" element={<AuthGuard><RoleGuard role="super_admin"><RetryActions /></RoleGuard></AuthGuard>} />
        <Route path="/archive" element={<AuthGuard><RoleGuard role="super_admin"><ArchiveManager /></RoleGuard></AuthGuard>} />
        <Route path="/bulk-actions" element={<AuthGuard><RoleGuard role="super_admin"><BulkActions /></RoleGuard></AuthGuard>} />
        <Route path="/tags" element={<AuthGuard><RoleGuard role="super_admin"><Tags /></RoleGuard></AuthGuard>} />
        <Route path="/dashboard/*" element={<AuthGuard><Navigate to="/dashboard" replace /></AuthGuard>} />
        <Route path="/dashboard/apps" element={<AuthGuard><Navigate to="/products" replace /></AuthGuard>} />

        <Route path="/dashboard/subscription" element={<AuthGuard><Navigate to="/subscription" replace /></AuthGuard>} />
        <Route path="/checkout" element={<AuthGuard><Checkout /></AuthGuard>} />
        <Route path="/success" element={<AuthGuard><Success /></AuthGuard>} />
        <Route path="/subscription" element={<AuthGuard><Subscription /></AuthGuard>} />
        <Route path="/app/:id" element={<AppRouteGuarded />} />
        <Route path="/app/:productId" element={<AppRouteGuarded />} />
        <Route path="/products" element={<AuthGuard><Products /></AuthGuard>} />
        <Route path="/products/create" element={<AuthGuard><RoleGuard role="super_admin"><Navigate to="/admin/add-product" replace /></RoleGuard></AuthGuard>} />
        <Route path="/products/update/:id" element={<ProductEditRouteGuarded />} />
        <Route path="/products/edit/:id" element={<ProductEditRouteGuarded />} />
        <Route path="/products/upload" element={<AuthGuard><RoleGuard role="super_admin"><Navigate to="/admin/add-product" replace /></RoleGuard></AuthGuard>} />
        <Route path="/products/:id" element={<ProductRouteGuarded />} />
        <Route path="/keys" element={<AuthGuard><Keys /></AuthGuard>} />
        <Route path="/user/orders" element={<AuthGuard><Keys /></AuthGuard>} />
        <Route path="/admin/keys" element={<AuthGuard><RoleGuard role="super_admin"><Navigate to="/keys" replace /></RoleGuard></AuthGuard>} />
        <Route path="/keys/generate" element={<AuthGuard><Navigate to="/keys" replace /></AuthGuard>} />
        <Route path="/servers" element={<AuthGuard><Servers /></AuthGuard>} />
        <Route path="/admin/servers" element={<AuthGuard><RoleGuard role="super_admin"><Servers /></RoleGuard></AuthGuard>} />
        <Route path="/servers/add" element={<AuthGuard><ServerAdd /></AuthGuard>} />
        <Route path="/servers/:id" element={<AuthGuard><ServerDetail /></AuthGuard>} />
        <Route path="/servers/:id/logs" element={<AuthGuard><ServerLogsPage /></AuthGuard>} />
        <Route path="/servers/:id/deploy" element={<AuthGuard><ServerDeployPage /></AuthGuard>} />
        <Route path="/servers/:id/dns" element={<AuthGuard><ServerDnsPage /></AuthGuard>} />
        <Route path="/servers/:id/hosting" element={<AuthGuard><ServerSettingsPage /></AuthGuard>} />
        <Route path="/servers/:id/git" element={<AuthGuard><ServerGitPage /></AuthGuard>} />
        <Route path="/servers/:id/settings" element={<AuthGuard><ServerSettingsPage /></AuthGuard>} />
        <Route path="/admin/servers/hosting" element={<AuthGuard><RoleGuard role="super_admin"><ServerSettingsPage /></RoleGuard></AuthGuard>} />

        <Route path="/role-detail" element={<AuthGuard><RoleDetail /></AuthGuard>} />
        <Route path="/transport-role-detail" element={<AuthGuard><TransportRoleDetail /></AuthGuard>} />
        <Route path="/manufacturing-role-detail" element={<AuthGuard><ManufacturingRoleDetail /></AuthGuard>} />
        <Route path="/education" element={<AuthGuard><EducationCategory /></AuthGuard>} />
        <Route path="/vala-builder" element={<AuthGuard><ValaBuilder /></AuthGuard>} />
        <Route path="/builder" element={<AuthGuard><Navigate to="/vala-builder" replace /></AuthGuard>} />
        <Route path="/auto-pilot" element={<AuthGuard><RoleGuard role="super_admin"><Automation /></RoleGuard></AuthGuard>} />
        <Route path="/admin/billing" element={<AuthGuard><RoleGuard role="super_admin"><Navigate to="/auto-pilot" replace /></RoleGuard></AuthGuard>} />
        <Route path="/auto-pilot/new-request" element={<AuthGuard><RoleGuard role="super_admin"><Navigate to="/auto-pilot" replace /></RoleGuard></AuthGuard>} />
        <Route path="/auto-pilot/generate" element={<AuthGuard><RoleGuard role="super_admin"><Navigate to="/auto-pilot" replace /></RoleGuard></AuthGuard>} />
        <Route path="/auto-pilot/queue" element={<AuthGuard><RoleGuard role="super_admin"><Navigate to="/auto-pilot" replace /></RoleGuard></AuthGuard>} />
        <Route path="/auto-pilot/apk-pipeline" element={<AuthGuard><RoleGuard role="super_admin"><Automation /></RoleGuard></AuthGuard>} />
        <Route path="/auto-pilot/system-monitor" element={<AuthGuard><RoleGuard role="super_admin"><Automation /></RoleGuard></AuthGuard>} />
        <Route path="/apk/build" element={<AuthGuard><RoleGuard role="super_admin"><Navigate to="/auto-pilot/apk-pipeline" replace /></RoleGuard></AuthGuard>} />
        <Route path="/apk/status/:id" element={<AuthGuard><RoleGuard role="super_admin"><Navigate to="/auto-pilot/apk-pipeline" replace /></RoleGuard></AuthGuard>} />
        <Route path="/apk-pipeline" element={<AuthGuard><RoleGuard role="super_admin"><Navigate to="/auto-pilot/apk-pipeline" replace /></RoleGuard></AuthGuard>} />
        <Route path="/system-monitor" element={<AuthGuard><RoleGuard role="super_admin"><Navigate to="/auto-pilot/system-monitor" replace /></RoleGuard></AuthGuard>} />
        <Route path="/ai" element={<AuthGuard><Navigate to="/ai-chat" replace /></AuthGuard>} />
        <Route path="/ai/chat" element={<AuthGuard><Navigate to="/ai-chat" replace /></AuthGuard>} />
        <Route path="/chat" element={<AuthGuard><Navigate to="/ai-chat" replace /></AuthGuard>} />
        <Route path="/chat/:id" element={<AuthGuard><ChatIdRedirect /></AuthGuard>} />
        <Route path="/ai-chat" element={<AuthGuard><AiChat /></AuthGuard>} />
        <Route path="/chat/history" element={<AuthGuard><Navigate to="/ai-chat" replace /></AuthGuard>} />
        <Route path="/saas-ai-dashboard" element={<AuthGuard><SaasAiDashboard /></AuthGuard>} />
        <Route path="/marketplace-admin" element={<AuthGuard><RoleGuard role="super_admin"><Navigate to="/admin/marketplace" replace /></RoleGuard></AuthGuard>} />
        <Route path="/ai/apis" element={<AuthGuard><Navigate to="/ai-apis" replace /></AuthGuard>} />
        <Route path="/ai-apis" element={<AuthGuard><AiApis /></AuthGuard>} />
        <Route path="/ai-apis/usage" element={<AuthGuard><Navigate to="/ai-apis" replace /></AuthGuard>} />
        <Route path="/wallet" element={<AuthGuard><Wallet /></AuthGuard>} />
        <Route path="/billing/credits" element={<AuthGuard><Navigate to="/wallet" replace /></AuthGuard>} />
        <Route path="/reseller" element={<AuthGuard><RoleGuard role="reseller"><Navigate to="/reseller-dashboard" replace /></RoleGuard></AuthGuard>} />
        <Route path="/seo-leads" element={<AuthGuard><SeoLeads /></AuthGuard>} />
        <Route path="/seo/scan" element={<AuthGuard><Navigate to="/seo-leads" replace /></AuthGuard>} />
        <Route path="/seo/leads" element={<AuthGuard><Navigate to="/seo-leads" replace /></AuthGuard>} />
        <Route path="/reseller-dashboard" element={<AuthGuard><RoleGuard role="reseller"><ResellerDashboard /></RoleGuard></AuthGuard>} />
        <Route path="/reseller/dashboard" element={<AuthGuard><RoleGuard role="reseller"><Navigate to="/reseller-dashboard" replace /></RoleGuard></AuthGuard>} />
        <Route path="/reseller/wallet" element={<AuthGuard><RoleGuard role="reseller"><Navigate to="/wallet" replace /></RoleGuard></AuthGuard>} />
        <Route path="/reseller/products" element={<AuthGuard><RoleGuard role="reseller"><Navigate to="/marketplace" replace /></RoleGuard></AuthGuard>} />
        <Route path="/reseller/leads" element={<AuthGuard><RoleGuard role="reseller"><Navigate to="/seo-leads" replace /></RoleGuard></AuthGuard>} />
        <Route path="/reseller/api-keys" element={<AuthGuard><RoleGuard role="reseller"><Navigate to="/keys" replace /></RoleGuard></AuthGuard>} />
        <Route path="/reseller/keys" element={<AuthGuard><RoleGuard role="reseller"><Navigate to="/keys" replace /></RoleGuard></AuthGuard>} />
        <Route path="/reseller/subscription" element={<AuthGuard><RoleGuard role="reseller"><Navigate to="/subscription" replace /></RoleGuard></AuthGuard>} />
        <Route path="/reseller/settings" element={<AuthGuard><RoleGuard role="reseller"><Navigate to="/reseller-dashboard?tab=settings" replace /></RoleGuard></AuthGuard>} />
        <Route path="/reseller/seo" element={<AuthGuard><RoleGuard role="reseller"><Navigate to="/seo-leads" replace /></RoleGuard></AuthGuard>} />
        <Route path="/reseller/ai" element={<AuthGuard><RoleGuard role="reseller"><Navigate to="/saas-ai-dashboard" replace /></RoleGuard></AuthGuard>} />
        <Route path="/reseller/analytics" element={<AuthGuard><RoleGuard role="reseller"><Navigate to="/analytics-pwa" replace /></RoleGuard></AuthGuard>} />

        <Route path="/reseller/buy" element={<AuthGuard><RoleGuard role="reseller"><Navigate to="/marketplace" replace /></RoleGuard></AuthGuard>} />
        <Route path="/reseller/users" element={<AuthGuard><RoleGuard role="reseller"><Navigate to="/reseller-dashboard?tab=users" replace /></RoleGuard></AuthGuard>} />
        <Route path="/reseller/earnings" element={<AuthGuard><RoleGuard role="reseller"><Navigate to="/reseller-dashboard?tab=commissions" replace /></RoleGuard></AuthGuard>} />
        <Route path="/reseller/*" element={<AuthGuard><RoleGuard role="reseller"><Navigate to="/reseller-dashboard" replace /></RoleGuard></AuthGuard>} />

        {/* Admin routes */}
        <Route path="/admin" element={<AuthGuard><RoleGuard role="super_admin"><Navigate to="/admin/marketplace" replace /></RoleGuard></AuthGuard>} />
        <Route path="/admin/*" element={<AuthGuard><RoleGuard role="super_admin"><Navigate to="/dashboard" replace /></RoleGuard></AuthGuard>} />
        <Route path="/admin/products" element={<AuthGuard><RoleGuard role="super_admin"><Navigate to="/admin/marketplace/products" replace /></RoleGuard></AuthGuard>} />
        <Route path="/admin/wallet" element={<AuthGuard><RoleGuard role="super_admin"><Navigate to="/wallet" replace /></RoleGuard></AuthGuard>} />
        <Route path="/admin/apk-pipeline" element={<AuthGuard><RoleGuard role="super_admin"><Navigate to="/auto-pilot/apk-pipeline" replace /></RoleGuard></AuthGuard>} />
        <Route path="/admin/audit-logs" element={<AuthGuard><RoleGuard role="super_admin"><Navigate to="/audit-logs" replace /></RoleGuard></AuthGuard>} />
        <Route path="/admin/orders" element={<AuthGuard><RoleGuard role="super_admin"><Navigate to="/dashboard/orders" replace /></RoleGuard></AuthGuard>} />
        <Route path="/admin/seo" element={<AuthGuard><RoleGuard role="super_admin"><Navigate to="/seo-leads" replace /></RoleGuard></AuthGuard>} />
        <Route path="/admin/ai" element={<AuthGuard><RoleGuard role="super_admin"><Navigate to="/saas-ai-dashboard" replace /></RoleGuard></AuthGuard>} />
        <Route path="/admin/resellers" element={<AuthGuard><RoleGuard role="super_admin"><Navigate to="/resellers" replace /></RoleGuard></AuthGuard>} />
        <Route path="/reseller-manager" element={<AuthGuard><RoleGuard role="super_admin"><Resellers /></RoleGuard></AuthGuard>} />
        <Route path="/resellers" element={<AuthGuard><RoleGuard role="super_admin"><Resellers /></RoleGuard></AuthGuard>} />
        <Route path="/settings" element={<AuthGuard><Settings /></AuthGuard>} />
        <Route path="/audit-logs" element={<AuthGuard><RoleGuard role="super_admin"><AuditLogs /></RoleGuard></AuthGuard>} />
        <Route path="/system-health" element={<AuthGuard><RoleGuard role="super_admin"><SystemHealth /></RoleGuard></AuthGuard>} />
        <Route path="/auto-pilot" element={<AuthGuard><RoleGuard role="super_admin"><Automation /></RoleGuard></AuthGuard>} />
        <Route path="/auto-pilot/apk-pipeline" element={<AuthGuard><RoleGuard role="super_admin"><Automation /></RoleGuard></AuthGuard>} />
        <Route path="/auto-pilot/system-monitor" element={<AuthGuard><RoleGuard role="super_admin"><Automation /></RoleGuard></AuthGuard>} />
        <Route path="/apk-pipeline" element={<AuthGuard><RoleGuard role="super_admin"><Navigate to="/auto-pilot/apk-pipeline" replace /></RoleGuard></AuthGuard>} />
        <Route path="/system-monitor" element={<AuthGuard><RoleGuard role="super_admin"><Navigate to="/auto-pilot/system-monitor" replace /></RoleGuard></AuthGuard>} />

        <Route path="/admin/add-product" element={<AuthGuard><RoleGuard role="super_admin"><AddProduct /></RoleGuard></AuthGuard>} />
        <Route path="/admin/products" element={<AuthGuard><RoleGuard role="super_admin"><Navigate to="/admin/marketplace/products" replace /></RoleGuard></AuthGuard>} />
        <Route path="/admin/marketplace" element={<AuthGuard><RoleGuard role="super_admin"><MarketplaceAdmin /></RoleGuard></AuthGuard>} />
        <Route path="/admin/marketplace/banners" element={<AuthGuard><RoleGuard role="super_admin"><MarketplaceAdmin /></RoleGuard></AuthGuard>} />
        <Route path="/admin/marketplace/offers" element={<AuthGuard><RoleGuard role="super_admin"><MarketplaceAdmin /></RoleGuard></AuthGuard>} />
        <Route path="/admin/marketplace/products" element={<AuthGuard><RoleGuard role="super_admin"><MarketplaceAdmin /></RoleGuard></AuthGuard>} />
        <Route path="/admin/marketplace/categories" element={<AuthGuard><RoleGuard role="super_admin"><MarketplaceAdmin /></RoleGuard></AuthGuard>} />
        <Route path="/admin/marketplace/languages" element={<AuthGuard><RoleGuard role="super_admin"><MarketplaceAdmin /></RoleGuard></AuthGuard>} />
        <Route path="/admin/marketplace/pricing" element={<AuthGuard><RoleGuard role="super_admin"><MarketplaceAdmin /></RoleGuard></AuthGuard>} />
        <Route path="/admin/marketplace/analytics" element={<AuthGuard><RoleGuard role="super_admin"><MarketplaceAdmin /></RoleGuard></AuthGuard>} />
        <Route path="/marketplace/product/:id" element={<ProductRouteGuarded />} />
        <Route path="/logout" element={<Logout />} />
        <Route path="/unauthorized" element={<Navigate to="/dashboard" replace />} />
        <Route path="/404" element={<NotFound />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <CartProvider>
            <SidebarProvider>
              <AppRoutes />
              <OfflineRetryBanner />
            </SidebarProvider>
          </CartProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
