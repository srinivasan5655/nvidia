import { MapContainer, TileLayer, Marker, Popup, Polygon } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const SOURCE_LABELS = {
  nws: 'NWS (National Weather Service)',
  usgs: 'USGS (stream gauges)',
  hcfcd: 'HCFCD (Harris County Flood Control)',
  transtar: 'TranStar (Houston road incidents)',
  fema: 'FEMA (disaster declarations)',
};

export default function EvidenceLayer({ run }) {
  if (!run) return <EmptyState />;

  const { event } = run;
  const bySource = event.items.reduce((acc, item) => {
    (acc[item.source] = acc[item.source] || []).push(item);
    return acc;
  }, {});

  const center = [
    event.polygon.reduce((s, p) => s + p[1], 0) / event.polygon.length,
    event.polygon.reduce((s, p) => s + p[0], 0) / event.polygon.length,
  ];
  const polygonLatLngs = event.polygon.map(([lon, lat]) => [lat, lon]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="card">
        <div className="label-upper" style={{ color: 'var(--accent)' }}>Evidence Layer</div>
        <div className="title-lg" style={{ marginTop: 6 }}>{event.label}</div>
        <div className="body-sm" style={{ marginTop: 6 }}>
          Event window: {fmt(event.window_start)} → {fmt(event.window_end)} · One auditable evidence record with
          source lineage — agents never see raw feeds, only these validated items.
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', height: 380 }}>
        <MapContainer center={center} zoom={11} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; OpenStreetMap &copy; CARTO'
          />
          <Polygon positions={polygonLatLngs} pathOptions={{ color: '#76b900', weight: 2, fillOpacity: 0.05 }} />
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

      {Object.entries(bySource).map(([source, items]) => (
        <div key={source} className="card">
          <div className="title-md" style={{ marginBottom: 12 }}>
            {SOURCE_LABELS[source] || source} <span className="caption">({items.length} record{items.length !== 1 ? 's' : ''})</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Source record ID</th>
                <th>Observed at</th>
                <th>Summary</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.item_id}>
                  <td className="mono">{item.source_record_id}</td>
                  <td className="mono">{fmt(item.observed_at)}</td>
                  <td>{item.summary}</td>
                  <td className="mono">{item.latitude.toFixed(3)}, {item.longitude.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function fmt(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function EmptyState() {
  return (
    <div className="card">
      <div className="body-md">No event has been run yet. Go to Overview and replay the Houston event first.</div>
    </div>
  );
}
