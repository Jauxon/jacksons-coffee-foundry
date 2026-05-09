"use client";

import { MapContainer, TileLayer, Marker, Popup, CircleMarker } from "react-leaflet";
import L from "leaflet";

// Colored circle as the map marker (no asset URLs to wrangle).
function dot(colorHex: string) {
  return L.divIcon({
    html: `<div style="width:18px;height:18px;border-radius:50%;background:${colorHex};border:3px solid #FAF7EF;box-shadow:0 0 0 1px #5C4830"></div>`,
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

export interface ShopMarker {
  id: number;
  name: string;
  lat: number;
  lng: number;
  colorHex: string;
  cashCents: number;
  isBankrupt: boolean;
  agentStrategy: string;
}

export function ShopMap({
  markers,
  center,
  zoom = 16,
}: {
  markers: ShopMarker[];
  center: { lat: number; lng: number };
  zoom?: number;
}) {
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={zoom}
      scrollWheelZoom={false}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {markers.map((m) => (
        <div key={m.id}>
          <CircleMarker
            center={[m.lat, m.lng]}
            radius={32}
            pathOptions={{ color: m.colorHex, fillColor: m.colorHex, fillOpacity: 0.15, weight: 2 }}
          />
          <Marker position={[m.lat, m.lng]} icon={dot(m.colorHex)}>
            <Popup>
              <div className="text-[12px]">
                <div className="font-semibold">{m.name}</div>
                <div className="text-slate-500">{m.agentStrategy}</div>
                {m.isBankrupt ? (
                  <div className="font-semibold mt-1 text-rose-700">BANKRUPT</div>
                ) : (
                  <div className="font-mono mt-1">${(m.cashCents / 100).toFixed(2)}</div>
                )}
                <a href={`/team/${m.id}`} className="text-blue-600 underline">View team →</a>
              </div>
            </Popup>
          </Marker>
        </div>
      ))}
    </MapContainer>
  );
}
