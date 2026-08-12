"use client";

import { useEffect, useMemo, useState } from "react";
import { APIProvider, Map, Marker, Polyline } from "@vis.gl/react-google-maps";
import type { Place } from "@wanderlust/domain";

type MapsClientConfig = {
  configured: boolean;
  apiKey?: string;
};

type GoogleTripMapProps = {
  places: Place[];
  destination: string;
  staticPreviewUrl?: string;
  staticPreviewFailed: boolean;
  onStaticPreviewFailed: () => void;
  onSelectPlaces: () => void;
};

type MapPoint = {
  id: string;
  name: string;
  position: google.maps.LatLngLiteral;
};

const defaultCenter = { lat: 30.0444, lng: 31.2357 };

export function GoogleTripMap({
  places,
  destination,
  staticPreviewUrl,
  staticPreviewFailed,
  onStaticPreviewFailed,
  onSelectPlaces
}: GoogleTripMapProps) {
  const [config, setConfig] = useState<MapsClientConfig | null>(null);
  const [configFailed, setConfigFailed] = useState(false);
  const [interactiveFailed, setInteractiveFailed] = useState(false);

  const points = useMemo(
    () =>
      places
        .filter((place) => Number.isFinite(place.latitude) && Number.isFinite(place.longitude))
        .slice(0, 18)
        .map((place): MapPoint => ({
          id: place.id,
          name: place.name,
          position: { lat: place.latitude, lng: place.longitude }
        })),
    [places]
  );

  const bounds = useMemo(() => getMapBounds(points), [points]);
  const center = useMemo(() => getMapCenter(points), [points]);
  const canRenderInteractive = Boolean(config?.configured && config.apiKey && points.length && !interactiveFailed);

  useEffect(() => {
    let isCurrent = true;

    async function loadConfig() {
      try {
        const response = await fetch("/api/maps/client-config");
        if (!response.ok) throw new Error(`maps_config_${response.status}`);
        const payload = (await response.json()) as MapsClientConfig;
        if (isCurrent) setConfig(payload);
      } catch {
        if (isCurrent) setConfigFailed(true);
      }
    }

    void loadConfig();
    return () => {
      isCurrent = false;
    };
  }, []);

  return (
    <div className={`map-card interactive-map${staticPreviewUrl && !staticPreviewFailed ? " has-google-preview" : ""}`}>
      {canRenderInteractive ? (
        <APIProvider apiKey={config!.apiKey!} language="zh-CN" region="CN" authReferrerPolicy="origin" onError={() => setInteractiveFailed(true)}>
          <Map
            className="google-trip-map"
            defaultBounds={bounds ? { ...bounds, padding: 72 } : undefined}
            defaultCenter={bounds ? undefined : center}
            defaultZoom={points.length > 1 ? 8 : 13}
            gestureHandling="greedy"
            mapTypeControl={false}
            streetViewControl={false}
            fullscreenControl
            zoomControl
            reuseMaps
          >
            {points.length > 1 ? (
              <Polyline
                path={points.map((point) => point.position)}
                strokeColor="#476878"
                strokeOpacity={0.82}
                strokeWeight={4}
              />
            ) : null}
            {points.map((point, pointIndex) => (
              <Marker
                key={point.id}
                icon={createPinIcon(pointIndex + 1)}
                position={point.position}
                title={`${pointIndex + 1}. ${point.name}`}
                onClick={onSelectPlaces}
              />
            ))}
          </Map>
        </APIProvider>
      ) : (
        <StaticMapFallback
          destination={destination}
          points={points}
          staticPreviewFailed={staticPreviewFailed}
          staticPreviewUrl={staticPreviewUrl}
          onSelectPlaces={onSelectPlaces}
          onStaticPreviewFailed={onStaticPreviewFailed}
        />
      )}
      {!canRenderInteractive && !configFailed && config === null ? <span className="map-loading">正在加载可缩放地图</span> : null}
      <span className="map-caption">{destination} 路线分布</span>
    </div>
  );
}

function StaticMapFallback({
  destination,
  points,
  staticPreviewFailed,
  staticPreviewUrl,
  onSelectPlaces,
  onStaticPreviewFailed
}: {
  destination: string;
  points: MapPoint[];
  staticPreviewFailed: boolean;
  staticPreviewUrl?: string;
  onSelectPlaces: () => void;
  onStaticPreviewFailed: () => void;
}) {
  return (
    <>
      {staticPreviewUrl && !staticPreviewFailed ? (
        <img
          alt={`${destination} Google 地图预览`}
          className="map-preview-image"
          src={staticPreviewUrl}
          onError={onStaticPreviewFailed}
        />
      ) : null}
      {points.map((point, pointIndex) => {
        const position = calculateFallbackMapPosition(point, points, pointIndex);
        return (
          <button
            key={point.id}
            aria-label={`地图地点 ${pointIndex + 1}：${point.name}`}
            className="map-pin"
            style={position}
            type="button"
            onClick={onSelectPlaces}
            title={point.name}
          >
            <span>{pointIndex + 1}</span>
          </button>
        );
      })}
    </>
  );
}

function getMapCenter(points: MapPoint[]): google.maps.LatLngLiteral {
  if (!points.length) return defaultCenter;
  const totals = points.reduce(
    (acc, point) => ({ lat: acc.lat + point.position.lat, lng: acc.lng + point.position.lng }),
    { lat: 0, lng: 0 }
  );
  return { lat: totals.lat / points.length, lng: totals.lng / points.length };
}

function getMapBounds(points: MapPoint[]): google.maps.LatLngBoundsLiteral | undefined {
  if (points.length < 2) return undefined;
  return points.reduce(
    (acc, point) => ({
      north: Math.max(acc.north, point.position.lat),
      south: Math.min(acc.south, point.position.lat),
      east: Math.max(acc.east, point.position.lng),
      west: Math.min(acc.west, point.position.lng)
    }),
    {
      north: points[0]!.position.lat,
      south: points[0]!.position.lat,
      east: points[0]!.position.lng,
      west: points[0]!.position.lng
    }
  );
}

function createPinIcon(index: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="180%">
      <feDropShadow dx="0" dy="6" stdDeviation="4" flood-color="#2d231a" flood-opacity="0.26"/>
    </filter>
    <path filter="url(#shadow)" d="M22 4C12.8 4 6 10.8 6 19.2c0 10.8 14.2 20.2 15.1 20.8.5.3 1.3.3 1.8 0 .9-.6 15.1-10 15.1-20.8C38 10.8 31.2 4 22 4Z" fill="#fff8ee" stroke="#9f5f4a" stroke-width="3"/>
    <circle cx="22" cy="19" r="10" fill="#fff8ee"/>
    <text x="22" y="23" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="800" fill="#7b4134">${index}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function calculateFallbackMapPosition(point: MapPoint, points: MapPoint[], index: number) {
  const latitudes = points.map((candidate) => candidate.position.lat);
  const longitudes = points.map((candidate) => candidate.position.lng);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const projectedLeft = maxLng === minLng ? 50 : 14 + ((point.position.lng - minLng) / (maxLng - minLng)) * 72;
  const projectedTop = maxLat === minLat ? 50 : 14 + ((maxLat - point.position.lat) / (maxLat - minLat)) * 72;
  const nearbyBefore = points.slice(0, index).filter((candidate) => {
    const candidateLeft = maxLng === minLng ? 50 : 14 + ((candidate.position.lng - minLng) / (maxLng - minLng)) * 72;
    const candidateTop = maxLat === minLat ? 50 : 14 + ((maxLat - candidate.position.lat) / (maxLat - minLat)) * 72;
    return Math.hypot(projectedLeft - candidateLeft, projectedTop - candidateTop) < 7.2;
  }).length;
  const ring = Math.floor(nearbyBefore / 6) + 1;
  const angle = nearbyBefore * 1.18;
  const spread = nearbyBefore ? Math.min(15.5, 9.5 + ring * 2.8) : 0;
  const left = Math.min(92, Math.max(8, projectedLeft + Math.cos(angle) * spread));
  const top = Math.min(92, Math.max(8, projectedTop + Math.sin(angle) * spread));
  return { left: `${left}%`, top: `${top}%` };
}
