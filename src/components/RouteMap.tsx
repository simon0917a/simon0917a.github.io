import { useEffect, useRef } from 'react'
import type { Map as LeafletMap } from 'leaflet'
import type { InternalOperator, RouteGeometry, RouteStop } from '../types/bus'

export function RouteMap({ stops, geometry = [], selectedStopId, operator }: {
  stops: RouteStop[]
  geometry?: RouteGeometry
  selectedStopId: string | null
  operator: InternalOperator
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)

  useEffect(() => {
    if (!containerRef.current || !stops.length) return
    let disposed = false

    void import('leaflet').then((leaflet) => {
      if (disposed || !containerRef.current) return
      const map = leaflet.map(containerRef.current, {
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: false,
      })
      mapRef.current = map
      leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 20,
        maxNativeZoom: 19,
        detectRetina: true,
        updateWhenZooming: false,
        keepBuffer: 4,
        attribution: '&copy; OpenStreetMap 貢獻者',
      }).addTo(map)

      const coordinates = stops.map((stop) => leaflet.latLng(stop.latitude, stop.longitude))
      const routeLines = geometry.length
        ? geometry.map((path) => path.map(([longitude, latitude]) => leaflet.latLng(latitude, longitude)))
        : [coordinates]
      leaflet.polyline(routeLines, { color: '#ffffff', weight: 10, opacity: 0.92, lineJoin: 'round', lineCap: 'round' }).addTo(map)
      const operatorColor = operator === 'citybus' ? '#e5a70e' : '#d12f32'
      leaflet.polyline(routeLines, { color: operatorColor, weight: 5, opacity: 0.95, lineJoin: 'round', lineCap: 'round' }).addTo(map)
      stops.forEach((stop, index) => {
        const selected = stop.stopId === selectedStopId
        const endpoint = index === 0 || index === stops.length - 1
        const marker = leaflet.circleMarker([stop.latitude, stop.longitude], {
          radius: selected ? 10 : endpoint ? 6 : 3.5,
          color: selected ? '#ffffff' : operatorColor,
          weight: selected ? 4 : 2,
          fillColor: selected ? operatorColor : '#ffffff',
          fillOpacity: 1,
        }).addTo(map)
        marker.bindTooltip(`${index + 1}. ${stop.stopName}`, { direction: 'top', opacity: 0.95 })
      })
      const selectedStop = stops.find((stop) => stop.stopId === selectedStopId)
      if (selectedStop) {
        map.setView([selectedStop.latitude, selectedStop.longitude], 17)
      } else {
        map.fitBounds(leaflet.latLngBounds(coordinates), { padding: [22, 22], maxZoom: 16 })
      }
      window.setTimeout(() => map.invalidateSize(), 0)
    })

    return () => {
      disposed = true
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [stops, geometry, selectedStopId, operator])

  if (!stops.length) return <div className="route-map-empty">暫未有路線座標</div>
  return (
    <section className={`route-map-card ${operator === 'citybus' ? 'citybus' : 'kmb'}`} aria-label={selectedStopId ? '最近車站地圖' : '完整路線地圖'}>
      <div ref={containerRef} className="route-map-canvas" />
      <div className="map-legend"><span><i />{selectedStopId ? '最近可乘搭車站' : '路線走向'}</span><small>可縮放及拖曳</small></div>
    </section>
  )
}
