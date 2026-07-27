// jsts 2.x ships as an ESM source tree under `jsts/org/...` with .d.ts under `jsts/types/...`.
// It has no package `exports`/`main` map, so `moduleResolution: bundler` cannot locate the parallel
// type files for a deep import. We depend on jsts ONLY inside `src/lib/gis/boolean.ts`, where the
// strong types are our own `VineyardPolygon` at the boundary; the jsts classes themselves are opaque.
declare module "jsts/org/locationtech/jts/monkey.js";
declare module "jsts/org/locationtech/jts/io/GeoJSONReader.js" {
  const GeoJSONReader: new (factory?: unknown) => {
    read(geojson: unknown): JstsGeometry;
  };
  export default GeoJSONReader;
}
declare module "jsts/org/locationtech/jts/io/GeoJSONWriter.js" {
  const GeoJSONWriter: new () => {
    write(geometry: JstsGeometry): { type: string; coordinates: unknown };
  };
  export default GeoJSONWriter;
}
declare module "jsts/org/locationtech/jts/operation/union/UnaryUnionOp.js" {
  const UnaryUnionOp: { union(geom: JstsGeometry): JstsGeometry };
  export default UnaryUnionOp;
}
declare module "jsts/org/locationtech/jts/operation/polygonize/Polygonizer.js" {
  const Polygonizer: new () => {
    add(geom: JstsGeometry): void;
    getPolygons(): { toArray(): JstsGeometry[]; size(): number };
  };
  export default Polygonizer;
}
declare module "jsts/org/locationtech/jts/precision/GeometryPrecisionReducer.js" {
  const GeometryPrecisionReducer: new (pm: unknown) => {
    setPointwise(v: boolean): void;
    reduce(geom: JstsGeometry): JstsGeometry;
  };
  export default GeometryPrecisionReducer;
}
declare module "jsts/org/locationtech/jts/geom/PrecisionModel.js" {
  const PrecisionModel: new (scale: number) => unknown;
  export default PrecisionModel;
}

// A minimal structural view of the jsts Geometry surface we touch.
interface JstsGeometry {
  getArea(): number;
  isEmpty(): boolean;
  isValid(): boolean;
  getNumGeometries(): number;
  getGeometryN(n: number): JstsGeometry;
  getBoundary(): JstsGeometry;
  union(other?: JstsGeometry): JstsGeometry;
  difference(other: JstsGeometry): JstsGeometry;
  intersection(other: JstsGeometry): JstsGeometry;
  distance(other: JstsGeometry): number;
  contains(other: JstsGeometry): boolean;
  getInteriorPoint(): JstsGeometry;
  getFactory(): { createGeometryCollection(geoms: JstsGeometry[]): JstsGeometry };
}
