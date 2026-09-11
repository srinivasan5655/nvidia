import { MapContainer, TileLayer, Marker, Popup, Polygon } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const SOURCE_LABELS = {
  nws: 'NWS (National Weather Service)',
  usgs: 'USGS (stream gauges)',
  hcfcd: 'HCFCD (Harris County Flood Control)',
  transtar: 'TranStar (Houston road incidents)',
  fema: 'FEMA (disaster declarations)',
  field_image: 'Field image (vision specialist input)',
};

function fmt(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * Plots the real EventBundle: every EvidenceItem the pipeline actually
 * ingested (lat/lon/source/summary/observed_at — nothing synthetic) plus the
 * event polygon it was evaluated against. This is the one map instance
 * reused across the Emergency Response and Insurance Exposure tabs so the
 * "same evidence record" story stays visually literal.
 */
export default function FloodMap({ event, height = 380 }) {
  if (!event) return null;

  const center = event.polygon && event.polygon.length > 0
    ? [
        event.polygon.reduce((s, p) => s + p[1], 0) / event.polygon.length,
        event.polygon.reduce((s, p) => s + p[0], 0) / event.polygon.length,
      ]
    : [29.76, -95.37]; // Houston, only used if a bundle somehow ships no polygon

  const polygonLatLngs = (event.polygon || []).map(([lon, lat]) => [lat, lon]);

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', height }}>
      <MapContainer center={center} zoom={11} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; OpenStreetMap &copy; CARTO'
        />
        {polygonLatLngs.length > 0 && (
          <Polygon positions={polygonLatLngs} pathOptions={{ color: '#76b900', weight: 2, fillOpacity: 0.05 }} />
        )}
        {event.items.map((item) => (
          <Marker key={item.item_id} position={[item.latitude, item.longitude]}>
            <Popup>
              <strong>{SOURCE_LABELS[item.source] || item.source}</strong>
              <br />
              {item.summary}
              <br />
              <em>{fmt(item.observed_at)}</em>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
