// src/types/leaflet-heat.d.ts
import * as L from 'leaflet';

declare module 'leaflet' {
  namespace HeatLayer {
    interface Options extends L.LayerOptions {
      radius?: number;
      blur?: number;
      maxZoom?: number;
      max?: number;
      minOpacity?: number;
      gradient?: { [key: number]: string };
    }
  }

  class HeatLayer extends L.Layer {
    constructor(latlngs: L.LatLngExpression[], options?: HeatLayer.Options);
    setLatLngs(latlngs: L.LatLngExpression[]): this;
    addLatLng(latlng: L.LatLngExpression): this;
    setOptions(options: HeatLayer.Options): this;
  }

  function heatLayer(latlngs: L.LatLngExpression[], options?: HeatLayer.Options): HeatLayer;
}