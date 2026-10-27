/* Access to the generated geometry (window.INDIA_MAP) and derived lookups. */

export function mapData() {
  return typeof window !== "undefined" ? window.INDIA_MAP : undefined;
}

export function shapes() {
  return mapData()?.shapes || [];
}

export function shapeFor(id) {
  return shapes().find((shape) => shape.id === id);
}

/** IDs of states whose outline touches the given state. */
export function neighboursOf(id) {
  return shapeFor(id)?.neighbours || [];
}

/** True for islands such as Lakshadweep, which have no land border. */
export function isIsland(id) {
  return neighboursOf(id).length === 0;
}

/** Units that make sense as a "which state shares a border" question. */
export function borderUnits(units) {
  return units.filter((unit) => neighboursOf(unit.id).length >= 3);
}

export function mapSize() {
  const data = mapData();
  return data ? { width: data.width, height: data.height } : { width: 1000, height: 1132 };
}
