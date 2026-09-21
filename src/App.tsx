import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './store/auth';
import AuthScreen from './screens/AuthScreen';
import HomeScreen from './screens/HomeScreen';
import ProfileScreen from './screens/ProfileScreen';
import TabLayout from './components/TabLayout';
import Splash from './components/Splash';
import DemoBadge from './components/DemoBadge';
import { DEV_AUTOLOGIN, devAutoLogin } from './lib/devAuth';

// Heavy screens (OCR / Maps / QR libs) are code-split so the initial app
// shell stays small and installs/loads fast on mobile.
const AppointmentsScreen = lazy(() => import('./screens/AppointmentsScreen'));
const NearbyScreen = lazy(() => import('./screens/NearbyScreen'));
const MedsScreen = lazy(() => import('./screens/MedsScreen'));
const KitScreen = lazy(() => import('./screens/KitScreen'));
const ComingSoonScreen = lazy(() => import('./screens/ComingSoonScreen'));

export default function App() {
  const { session, loading } = useAuth();
  // Dev convenience: sign in silently as the demo user so every feature is
  // reachable without going through the login screen. Auth itself is intact.
  const [autoLoggingIn, setAutoLoggingIn] = useState(DEV_AUTOLOGIN);
  const [autoLoginFailed, setAutoLoginFailed] = useState(false);
  const attempts = useRef(0);

  useEffect(() => {
    // Retry once if the session is dropped (e.g. a stale token was signed out),
    // but cap attempts so a persistent failure can't loop.
    if (!DEV_AUTOLOGIN || loading || session || attempts.current >= 2) {
      if (!DEV_AUTOLOGIN) setAutoLoggingIn(false);
      return;
    }
    attempts.current += 1;
    setAutoLoggingIn(true);
    setAutoLoginFailed(false);
    devAutoLogin()
      .catch((e) => {
        console.error('[MySihatLah] dev auto-login failed — showing the login screen instead:', e);
        setAutoLoginFailed(true);
      })
      .finally(() => setAutoLoggingIn(false));
  }, [loading, session]);

  // The DEMO badge is an overlay rendered on every screen (including Splash and
  // the auth flow), so it is never absent from a demo build.
  return (
    <>
      <DemoBadge />
      {loading || (autoLoggingIn && !autoLoginFailed && !session) ? (
        <Splash />
      ) : session ? (
        <AuthedRoutes />
      ) : (
        <GuestRoutes />
      )}
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
