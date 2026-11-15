// mapdata.js — Ember Yard as data: solid boxes, tanks, sites, spawns and the
// waypoint graph the bots walk. world.js turns this into meshes and colliders;
// nothing here knows about three.js.
//
// Coordinates: metres, x east, z south, ground plane y=0. Boxes are centre x/z
// with footprint w (x) by d (z) and height h, standing on the ground.
// The yard is 96 by 72, walled all round. Breakers spawn west, Wardens east.
// Site A is the Furnace Hall (north-east), Site B the Fuel Depot (south-east).

export const BOUNDS = { x0: -48, x1: 48, z0: -36, z1: 36 };

// mat keys are resolved to materials and canvas textures in world.js.
export const BOXES = [
  // perimeter
  { x: 0, z: -36, w: 97, d: 1, h: 5, mat: 'concreteDark' },
  { x: 0, z: 36, w: 97, d: 1, h: 5, mat: 'concreteDark' },
  { x: -48, z: 0, w: 1, d: 73, h: 5, mat: 'concreteDark' },
  { x: 48, z: 0, w: 1, d: 73, h: 5, mat: 'concreteDark' },
  // warehouse block, mid-north: the wall both lanes bend around
  { x: 0, z: -17, w: 24, d: 8, h: 6, mat: 'steelDark' },
  // south block: splits the mid-to-B connectors
  { x: 1, z: 17, w: 14, d: 6, h: 5, mat: 'steel' },
  // Furnace Hall walls (site A): west wall with a door at z -24.5..-21.5,
  // south wall with doors at x 25..28 and x 40..43
  { x: 19, z: -29.75, w: 0.8, d: 10.5, h: 5.5, mat: 'concrete' },
  { x: 19, z: -17.25, w: 0.8, d: 8.5, h: 5.5, mat: 'concrete' },
  { x: 22, z: -13, w: 6, d: 0.8, h: 5.5, mat: 'concrete' },
  { x: 34, z: -13, w: 12, d: 0.8, h: 5.5, mat: 'concrete' },
  { x: 45, z: -13, w: 4, d: 0.8, h: 5.5, mat: 'concrete' },
  // hall pillars
  { x: 27, z: -29, w: 1.4, d: 1.4, h: 5, mat: 'concreteDark' },
  { x: 27, z: -19, w: 1.4, d: 1.4, h: 5, mat: 'concreteDark' },
  { x: 39, z: -29, w: 1.4, d: 1.4, h: 5, mat: 'concreteDark' },
  { x: 39, z: -19, w: 1.4, d: 1.4, h: 5, mat: 'concreteDark' },
  // the furnace itself, along the hall's north wall
  { x: 36, z: -33.2, w: 12, d: 3.6, h: 4, mat: 'furnace' },
  // hall crates
  { x: 23, z: -31, w: 1.1, d: 1.1, h: 1.1, mat: 'crate' },
  { x: 24.25, z: -31, w: 1.1, d: 1.1, h: 1.1, mat: 'crate' },
  { x: 43, z: -17, w: 1.1, d: 1.1, h: 1.1, mat: 'crate' },
  { x: 31, z: -15.5, w: 2.2, d: 1.1, h: 1.1, mat: 'crate' },
  { x: 44, z: -14.5, w: 1.1, d: 1.1, h: 1.1, mat: 'crate' },
  // Fuel Depot fence (site B): west side, gate at z 19..23
  { x: 17, z: 15.5, w: 0.6, d: 7, h: 3.2, mat: 'steel' },
  { x: 17, z: 29, w: 0.6, d: 12, h: 3.2, mat: 'steel' },
  // horizontal tank and pipe run inside the depot
  { x: 34, z: 20, w: 7, d: 3, h: 3, mat: 'tank' },
  { x: 25, z: 26, w: 10, d: 0.8, h: 0.8, mat: 'steelDark' },
  // depot crates and the sandbag line just inside the gate
  { x: 21, z: 14, w: 1.1, d: 1.1, h: 1.1, mat: 'crate' },
  { x: 45.5, z: 12.5, w: 1.1, d: 1.1, h: 2.2, mat: 'crate' },
  { x: 21, z: 18.6, w: 0.9, d: 2, h: 0.95, mat: 'sandbag' },
  // mid yard containers: the centre of every fight
  { x: -6, z: -4, w: 6.2, d: 2.6, h: 2.6, mat: 'containerA' },
  { x: -10.5, z: 2.5, w: 2.6, d: 6.2, h: 2.6, mat: 'containerB' },
  { x: 8, z: 6, w: 6.2, d: 2.6, h: 2.6, mat: 'containerC' },
  { x: 2, z: -8, w: 1.1, d: 1.1, h: 2.2, mat: 'crate' },
  { x: -3.5, z: 8.5, w: 1.1, d: 1.1, h: 1.1, mat: 'crate' },
  { x: 13, z: -7, w: 1.1, d: 1.1, h: 1.1, mat: 'crate' },
  // loading dock east of mid, with its step
  { x: 23, z: 0, w: 6, d: 6, h: 1.0, mat: 'concreteDark' },
  { x: 19.5, z: 0, w: 1, d: 3, h: 0.5, mat: 'concreteDark' },
  // north yard dressing
  { x: -13, z: -24, w: 1.1, d: 1.1, h: 1.1, mat: 'crate' },
  { x: -24, z: -27, w: 2.2, d: 1.1, h: 1.1, mat: 'crate' },
  { x: 6, z: -24, w: 3, d: 0.9, h: 0.95, mat: 'sandbag' },
  // attacker yard
  { x: -36, z: -8, w: 1.1, d: 1.1, h: 1.1, mat: 'crate' },
  { x: -36, z: 8, w: 1.1, d: 1.1, h: 1.1, mat: 'crate' },
  { x: -25, z: -13, w: 6.2, d: 2.6, h: 2.6, mat: 'containerB' },
  { x: -20, z: 0, w: 0.9, d: 3, h: 0.95, mat: 'sandbag' },
  // south lane dressing
  { x: -14, z: 28.5, w: 6.2, d: 2.6, h: 2.6, mat: 'containerA' },
  { x: -22, z: 22, w: 1.1, d: 1.1, h: 1.1, mat: 'crate' },
  { x: 2, z: 27, w: 3, d: 0.9, h: 0.95, mat: 'sandbag' },
  // east strip dressing
  { x: 45, z: 6, w: 1.1, d: 1.1, h: 1.1, mat: 'crate' },
  { x: 41, z: 10, w: 0.9, d: 3, h: 0.95, mat: 'sandbag' },
];

// Round fuel tanks: collision is the square that bounds the cylinder.
export const TANKS = [
  { x: 27, z: 17, r: 2.3, h: 5 },
  { x: 38, z: 29, r: 2.3, h: 5 },
  { x: 25, z: 31, r: 2.3, h: 5 },
];

// Lamp posts (visual: pole, glowing head, a real point light on the first few).
export const LAMPS = [
  { x: -16, z: -1 }, { x: 16, z: -16 }, { x: 33, z: -24 },
  { x: 33, z: 24 }, { x: 0, z: 24 }, { x: -30, z: -25 }, { x: 42, z: 0 },
];

export const SITES = {
  A: { id: 'A', name: 'Site A — Furnace Hall', x: 34, z: -24, r: 6.5 },
  B: { id: 'B', name: 'Site B — Fuel Depot', x: 33, z: 24, r: 6.5 },
};

// yaw: forward is (sin yaw, 0, cos yaw), so pi/2 faces +x (east).
export const SPAWNS = {
  breaker: [
    { x: -44, z: -4, yaw: Math.PI / 2 }, { x: -45, z: 0, yaw: Math.PI / 2 },
    { x: -44, z: 4, yaw: Math.PI / 2 }, { x: -43, z: -8, yaw: Math.PI / 2 },
    { x: -43, z: 8, yaw: Math.PI / 2 },
  ],
  warden: [
    { x: 44, z: -4, yaw: -Math.PI / 2 }, { x: 45, z: 0, yaw: -Math.PI / 2 },
    { x: 44, z: 4, yaw: -Math.PI / 2 }, { x: 43, z: -8, yaw: -Math.PI / 2 },
    { x: 43, z: 8, yaw: -Math.PI / 2 },
  ],
};

// Waypoint graph. Bots path node to node; every edge was checked to keep clear
// of the boxes above (a straight walk between its two ends touches nothing).
export const NODES = [
  { id: 0, x: -42, z: 0 },     // breaker spawn
  { id: 1, x: -32, z: 0 },     // breaker yard
  { id: 2, x: -30, z: -25 },   // north entry
  { id: 3, x: -16, z: -26 },   // north yard west
  { id: 4, x: 0, z: -26 },     // north yard centre
  { id: 5, x: 14, z: -24 },    // hall approach
  { id: 6, x: 21, z: -23 },    // inside hall west door
  { id: 7, x: 33, z: -24 },    // site A centre
  { id: 8, x: 43, z: -27 },    // hall back corner
  { id: 9, x: 41.5, z: -11 },  // outside hall east door
  { id: 10, x: -18, z: -2 },   // mid west
  { id: 11, x: 0, z: 0 },      // mid centre
  { id: 12, x: 13, z: 0 },     // mid east
  { id: 13, x: 23, z: -5 },    // dock north side
  { id: 14, x: 42, z: 1 },     // warden spawn / east strip
  { id: 15, x: 42, z: -8 },    // east strip north
  { id: 16, x: 42, z: 14 },    // depot north edge
  { id: 17, x: 33, z: 24 },    // site B centre
  { id: 18, x: 15, z: 21 },    // outside depot gate
  { id: 19, x: 20, z: 21 },    // inside depot gate
  { id: 20, x: -30, z: 24 },   // south entry
  { id: 21, x: -14, z: 25 },   // south lane
  { id: 22, x: 12, z: 17 },    // south-east connector
  { id: 23, x: 0, z: 10 },     // mid south
  { id: 24, x: 16, z: -16 },   // A connector
  { id: 25, x: -15, z: -17 },  // west connector
  { id: 26, x: 23, z: -16 },   // hall south-west corner
  { id: 27, x: 28, z: -10 },   // outside hall mid door
  { id: 28, x: -11, z: 17 },   // south-west connector
  { id: 29, x: 44, z: 20 },    // depot east side
  { id: 30, x: 23, z: 5 },     // dock south side
];

export const EDGES = [
  [0, 1], [1, 2], [1, 10], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8],
  [5, 24], [24, 12],
  [10, 11], [11, 12], [12, 13], [13, 14], [14, 15], [15, 9], [9, 8], [9, 27],
  [12, 30], [30, 14], [14, 16], [16, 29], [17, 29], [19, 17],
  [18, 19], [12, 22], [22, 18], [21, 19],
  [1, 20], [20, 21], [21, 28], [23, 28], [11, 23], [10, 25], [25, 3],
  [26, 6], [27, 26], [27, 12],
];

// Hold points: where a defending bot settles for each site, and the node it
// watches from. Chosen for a sightline over the site's main entry.
export const HOLDS = {
  A: [{ node: 8, watch: 6 }, { node: 26, watch: 24 }, { node: 9, watch: 15 }],
  B: [{ node: 29, watch: 19 }, { node: 16, watch: 18 }, { node: 17, watch: 19 }],
  mid: [{ node: 13, watch: 12 }, { node: 12, watch: 11 }],
};
