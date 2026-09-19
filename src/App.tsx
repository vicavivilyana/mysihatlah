import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './store/auth';
import AuthScreen from './screens/AuthScreen';
import HomeScreen from './screens/HomeScreen';
import ProfileScreen from './screens/ProfileScreen';
import TabLayout from './components/TabLayout';
import Splash from './components/Splash';
import DemoBadge from './components/DemoBadge';

// Heavy screens (OCR / Maps / QR libs) are code-split so the initial app
// shell stays small and installs/loads fast on mobile.
const AppointmentsScreen = lazy(() => import('./screens/AppointmentsScreen'));
const NearbyScreen = lazy(() => import('./screens/NearbyScreen'));
const MedsScreen = lazy(() => import('./screens/MedsScreen'));
const KitScreen = lazy(() => import('./screens/KitScreen'));
const ComingSoonScreen = lazy(() => import('./screens/ComingSoonScreen'));

export default function App() {
  const { session, loading } = useAuth();

  // The DEMO badge is an overlay rendered on every screen (including Splash and
  // the auth flow), so it is never absent from a demo build.
  return (
    <>
      <DemoBadge />
      {loading ? <Splash /> : session ? <AuthedRoutes /> : <GuestRoutes />}
    </>
  );
}

function GuestRoutes() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthScreen />} />
      <Route path="*" element={<Navigate to="/auth" replace />} />
    </Routes>
  );
}

function AuthedRoutes() {
  return (
    <Suspense fallback={<Splash />}>
      <Routes>
        <Route element={<TabLayout />}>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/appointments" element={<AppointmentsScreen />} />
          <Route path="/meds" element={<MedsScreen />} />
          <Route path="/kit" element={<KitScreen />} />
          <Route path="/me" element={<ProfileScreen />} />
        </Route>
        <Route path="/nearby" element={<NearbyScreen />} />
        <Route path="/coming-soon/:feature" element={<ComingSoonScreen />} />
        <Route path="/auth" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
