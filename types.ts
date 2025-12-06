
export interface Point3D {
  x: number; // World X
  y: number; // World Depth
  z: number; // World Elevation
}

export interface Point2D {
  x: number;
  z: number;
}

export interface LineSegment {
    p1: Point2D;
    p2: Point2D;
}

export interface Hallway {
    line1: LineSegment | null;
    line2: LineSegment | null;
    isValid: boolean; // parallelism check
}

export interface Route {
  id: string;
  path: Point3D[];
}

export interface Attachment {
  rise: number;
  branch_len: number;
  dir: 'left' | 'right';
  style: 'line' | 'wall';
  thick: number;
  auto: boolean;
  branch_scale: number;
}

export interface BaseShape {
  id: string;
  type: string;
  displayName?: string;
  x: number; // World X
  y: number; // World Z (Elevation)
  attach: Attachment | null;
}

export interface Circle extends BaseShape {
  type: 'circle';
  r: number;
}

export interface Rectangle extends BaseShape {
  type: 'rect';
  w: number;
  h: number;
}

export type Shape = Circle | Rectangle;

export interface Wall {
  id: string;
  p1: { x: number, y: number }; // X, Z
  p2: { x: number, y: number }; // X, Z
  thickness: number;
}

export interface Section {
  id: string;
  name: string;
  p1: { x: number, y: number };
  p2: { x: number, y: number };
}

export interface PlanView {
    id: string;
    name: string;
    z: number;
    cadImage?: string; // Data URL or Image Source
    cadScale: number;
    cadX: number;
    cadY: number;
    cadOpacity: number;
}

/* Drawing Tools Types */
export type DrawingTool = 'none' | 'room' | 'endpoint' | 'trunk';

export type NamedElement = { id: string; type: 'room'|'hallway'|'section'|'equipment'|'duct'|'pipe'|'branch'; displayName: string; };

export interface Room {
    id: string;
    displayName: string;
    points: Point2D[];
}

export interface Endpoint {
    id: string;
    displayName: string;
    x: number;
    z: number;
}

export interface Trunk {
    id: string;
    displayName: string;
    p1: Point2D;
    p2: Point2D;
    width: number;
}

/* Branching Logic */
export type BranchStyle = 'vertical-first' | 'takeoff-45';

export interface RouteOptions {
    branchStyle: BranchStyle;
    sectionDepthPx: number;
    minBendRadiusPx: number;
}

export interface Branch {
    id: string;
    displayName: string;
    trunkId: string;
    endpointId: string;
    path: Point3D[]; // Generated path
}

/* Clash Detection */
export interface Clash {
    id: string;
    aId: string;
    bId: string;
    at: Point2D;
    severity: 'hard' | 'soft';
    view: 'front';
}

/* Tag / Layer System */
export type TagType = 'hallway' | 'room' | 'wall' | 'shaft' | 'endpoint' | 'trunk' | 'duct' | 'pipe' | 'branch';

export interface TagSetting {
  visible: boolean;
  opacity: number;
}

export type TagSettings = Record<TagType, TagSetting>;

export interface ProjectState {
    version: number;
    shapes: Shape[];
    walls: Wall[];
    rooms: Room[];
    endpoints: Endpoint[];
    trunks: Trunk[];
    hallway: Hallway;
    routes: Route[];
    branches: Branch[];
    clashes: Clash[];
    routeOptions: RouteOptions;
    tagSettings: TagSettings;
}

export interface HistoryState {
    past: ProjectState[];
    future: ProjectState[];
}

export type ElementType = 'shape' | 'room' | 'endpoint' | 'trunk' | 'wall' | 'route' | 'hallway';
export interface SelectionState {
    type: ElementType;
    id: string;
}

export interface ExportData {
    routes: { id: string, path: Point3D[] }[];
    tags: TagSettings;
}
