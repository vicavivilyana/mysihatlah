import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { APIProvider, Map, AdvancedMarker, InfoWindow, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { MapPinOff } from 'lucide-react';
import { hasGeolocation } from '@/lib/capabilities';

const KL_CENTER = { lat: 3.139, lng: 101.6869 }; // Kuala Lumpur fallback
const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';

interface Poi {
  key: string;
  name: string;
  location: google.maps.LatLngLiteral;
  vicinity?: string;
}

const CATEGORY_TYPES: Record<string, string> = {
  food: 'restaurant',
  pharmacy: 'pharmacy',
  clinic: 'doctor',
  convenience: 'convenience_store',
};

function PlacesLayer({
  center,
  category,
  onResults,
}: {
  center: google.maps.LatLngLiteral;
  category: string;
  onResults: (pois: Poi[]) => void;
}) {
  const map = useMap();
  const placesLib = useMapsLibrary('places');

  useEffect(() => {
    if (!placesLib || !map) return;
    const svc = new placesLib.PlacesService(map);
    svc.nearbySearch(
      { location: center, radius: 1500, type: CATEGORY_TYPES[category] },
      (results, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !results) {
          onResults([]);
          return;
        }
        onResults(
          results.slice(0, 20).map((r, i) => ({
            key: r.place_id ?? `${i}`,
            name: r.name ?? 'Place',
            location: {
              lat: r.geometry?.location?.lat() ?? center.lat,
              lng: r.geometry?.location?.lng() ?? center.lng,
            },
            vicinity: r.vicinity,
          })),
        );
      },
    );
  }, [placesLib, map, center, category, onResults]);

  return null;
}

function NearbyMap() {
  const { t } = useTranslation();
  const [center, setCenter] = useState<google.maps.LatLngLiteral>(KL_CENTER);
  const [located, setLocated] = useState(false);
  const [denied, setDenied] = useState(false);
  const [category, setCategory] = useState('food');
  const [pois, setPois] = useState<Poi[]>([]);
  const [active, setActive] = useState<Poi | null>(null);

  useEffect(() => {
    if (!hasGeolocation()) {
      setDenied(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocated(true);
      },
      () => setDenied(true),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  return (
    <div className="relative h-full">
      {/* Category chips */}
      <div className="absolute inset-x-0 top-0 z-10 flex gap-2 overflow-x-auto px-4 py-3 safe-top">
        {Object.keys(CATEGORY_TYPES).map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium shadow-card transition ${
              category === c ? 'bg-navy text-white' : 'bg-white text-ink'
            }`}
          >
            {t(`nearby.categories.${c}`)}
          </button>
        ))}
      </div>

      {denied && (
        <div className="absolute inset-x-0 top-16 z-10 mx-4 rounded-2xl bg-navy/90 px-4 py-2 text-center text-xs text-white">
          {t('nearby.locationDenied')}
        </div>
      )}

      <Map
        defaultCenter={KL_CENTER}
        center={center}
        defaultZoom={15}
        mapId={MAP_ID}
        gestureHandling="greedy"
        disableDefaultUI
        className="h-full w-full"
      >
        {located && (
          <AdvancedMarker position={center}>
            <div className="h-4 w-4 rounded-full border-2 border-white bg-navy shadow" />
          </AdvancedMarker>
        )}
        {pois.map((p) => (
          <AdvancedMarker key={p.key} position={p.location} onClick={() => setActive(p)} />
        ))}
        {active && (
          <InfoWindow position={active.location} onCloseClick={() => setActive(null)}>
            <div className="max-w-[200px]">
              <p className="font-semibold text-ink">{active.name}</p>
              {active.vicinity && <p className="text-xs text-ink-muted">{active.vicinity}</p>}
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${active.location.lat},${active.location.lng}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-xs font-medium text-navy underline"
              >
                {t('nearby.openMaps')}
              </a>
            </div>
          </InfoWindow>
        )}
        <PlacesLayer center={center} category={category} onResults={setPois} />
      </Map>
    </div>
  );
}

export default function NearbyScreen() {
  const { t } = useTranslation();

  if (!MAPS_KEY) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center safe-top">
        <MapPinOff className="text-ink-muted" size={40} />
        <p className="mt-4 text-ink-muted">{t('nearby.noKey')}</p>
      </div>
    );
  }

  return (
    <div className="h-full">
      <APIProvider apiKey={MAPS_KEY} libraries={['places']}>
        <NearbyMap />
      </APIProvider>
    </div>
  );
}
