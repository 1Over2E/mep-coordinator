
import { Shape, Circle, Rectangle, Point3D, Attachment, Wall, LineSegment, Hallway, Point2D, Room, Trunk, Endpoint, RouteOptions, Branch, Clash } from '../types';
import * as re from './regex';
import { SCREEN_W, SCREEN_H, MAX_DEPTH } from '../utils/viewport';

// NOTE: Shape.x = World X. Shape.y = World Z (Elevation).

const ATTACH_RISE_PIPE = 40;
const ATTACH_RISE_DUCT = 40;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(v, b));

// Simple cache for bounding boxes to avoid re-calculating during heavy loops
const bboxCache = new WeakMap<Shape, { x: number, y: number, width: number, height: number }>();

export const getShapeBBox = (s: Shape): { x: number, y: number, width: number, height: number } => {
    let cached = bboxCache.get(s);
    if (!cached) {
        if (s.type === 'circle') {
            cached = { x: s.x - s.r, y: s.y - s.r, width: 2 * s.r, height: 2 * s.r };
        } else {
            cached = { x: s.x, y: s.y, width: s.w, height: s.h };
        }
        bboxCache.set(s, cached);
    }
    return cached;
};

// Force clear cache for a specific shape (when moved)
export const invalidateShapeCache = (s: Shape) => bboxCache.delete(s);

export const getAttachmentRects = (s: Shape): { x: number, y: number, width: number, height: number }[] => {
    if (!s.attach) return [];
    const att = s.attach;
    const dir_right = att.dir === 'right';
    const branch_scale = clamp(att.branch_scale, 0.05, 0.99);

    if (s.type === 'circle') {
        const { x: cx, y: cy, r } = s;
        const branch_thick = r;
        const riser_thick = r;
        const pipe_top_y = cy - r; 
        const branch_y_center = pipe_top_y - att.rise;
        
        const riser_rect = { x: cx - riser_thick / 2, y: branch_y_center, width: riser_thick, height: pipe_top_y - branch_y_center };
        const by = branch_y_center - (branch_thick / 2);
        const branch_rect = dir_right
            ? { x: cx, y: by, width: att.branch_len, height: branch_thick }
            : { x: cx - att.branch_len, y: by, width: att.branch_len, height: branch_thick };
        return [riser_rect, branch_rect];
    } else { 
        const { x, y, w, h } = s;
        const cx_top = x + w / 2;
        const branch_h = Math.max(6, h * branch_scale);
        const elbow_size = branch_h;
        const elbow_x = cx_top - elbow_size / 2;
        const elbow_y = y + h / 2 - elbow_size / 2;
        const branch_y = y + h / 2 - branch_h / 2;
        const branch_rect = dir_right
            ? { x: cx_top + elbow_size / 2, y: branch_y, width: att.branch_len, height: branch_h }
            : { x: cx_top - att.branch_len - elbow_size / 2, y: branch_y, width: att.branch_len, height: branch_h };
        return [{ x: elbow_x, y: elbow_y, width: elbow_size, height: elbow_size }, branch_rect];
    }
};

export const keepInScreen = (s: Shape): void => {
    invalidateShapeCache(s);
    if (s.type === 'rect') {
        s.x = clamp(s.x, 0, SCREEN_W - s.w);
        s.y = clamp(s.y, 0, SCREEN_H - s.h);
    } else {
        s.x = clamp(s.x, s.r, SCREEN_W - s.r);
        s.y = clamp(s.y, s.r, SCREEN_H - s.r);
    }
};

export const enforceRules = (shapes: Shape[], rectElevation: number, pipeElevation: number): void => {
    shapes.forEach(s => {
        if (s.type === 'rect') s.y = rectElevation;
        else s.y = pipeElevation;
        keepInScreen(s);
    });
};

function distSquared(v: {x: number, y: number}, w: {x: number, y: number}) { return (v.x - w.x)**2 + (v.y - w.y)**2; }
function distToSegmentSquared(p: {x: number, y: number}, v: {x: number, y: number}, w: {x: number, y: number}) {
    const l2 = distSquared(v, w);
    if (l2 === 0) return { distSq: distSquared(p, v), closest: v };
    let t = Math.max(0, Math.min(1, ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2));
    const projection = { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
    return { distSq: distSquared(p, projection), closest: projection };
}

export const resolveCollisions = (shapes: Shape[], tolerance: number, rectElevation: number, pipeElevation: number, walls: Wall[] = []): Shape[] => {
    const newShapes = JSON.parse(JSON.stringify(shapes)) as Shape[];
    const MAX_ITER = 50;
    
    for (let iter = 0; iter < MAX_ITER; iter++) {
        let wasCollision = false;
        
        // Pre-calculate BBoxes for this iteration to avoid repeated calls
        const bboxes = newShapes.map(s => {
             if(s.type === 'circle') return { x: s.x - s.r, y: s.y - s.r, width: 2 * s.r, height: 2 * s.r };
             return { x: s.x, y: s.y, width: s.w, height: s.h };
        });

        // Wall collisions
        if (walls.length > 0) {
            newShapes.forEach(s => {
                walls.forEach(w => {
                    const center = s.type === 'rect' ? {x: s.x + s.w/2, y: s.y + s.h/2} : {x: s.x, y: s.y};
                    const { distSq, closest } = distToSegmentSquared(center, w.p1, w.p2);
                    const dist = Math.sqrt(distSq);
                    const radius = s.type === 'circle' ? s.r : Math.min(s.w, s.h)/2;
                    const minDist = radius + w.thickness/2 + tolerance;
                    if (dist < minDist) {
                         const overlap = minDist - dist;
                         const nx = dist > 0 ? (center.x - closest.x)/dist : 1;
                         const ny = dist > 0 ? (center.y - closest.y)/dist : 0;
                         s.x += nx * overlap; s.y += ny * overlap;
                         wasCollision = true;
                    }
                });
            });
        }
        
        // Shape-Shape collisions
        for (let i = 0; i < newShapes.length; i++) {
            for (let j = i + 1; j < newShapes.length; j++) {
                const s1box = bboxes[i];
                const s2box = bboxes[j];
                
                const ox = Math.max(0, Math.min(s1box.x+s1box.width, s2box.x+s2box.width) - Math.max(s1box.x, s2box.x));
                const oy = Math.max(0, Math.min(s1box.y+s1box.height, s2box.y+s2box.height) - Math.max(s1box.y, s2box.y));
                
                if (ox > tolerance && oy > tolerance) {
                    const push = Math.min(ox, oy) - tolerance;
                    if (ox < oy) { 
                        newShapes[i].x -= push/2; 
                        newShapes[j].x += push/2; 
                    } else { 
                        newShapes[i].y -= push/2; 
                        newShapes[j].y += push/2; 
                    }
                    wasCollision = true;
                }
            }
        }
        enforceRules(newShapes, rectElevation, pipeElevation);
        if (!wasCollision) break;
    }
    return newShapes;
};

// Clash Detection with Hard/Soft severity
export const detectClashes = (shapes: Shape[], walls: Wall[]): Clash[] => {
    const clashes: Clash[] = [];
    const SOFT_BUFFER = 20;

    // Shape vs Shape
    for (let i = 0; i < shapes.length; i++) {
        for (let j = i + 1; j < shapes.length; j++) {
            const s1 = shapes[i];
            const s2 = shapes[j];
            const b1 = getShapeBBox(s1);
            const b2 = getShapeBBox(s2);

            // Expand for soft check
            const ox = Math.max(0, Math.min(b1.x + b1.width + SOFT_BUFFER, b2.x + b2.width + SOFT_BUFFER) - Math.max(b1.x - SOFT_BUFFER, b2.x - SOFT_BUFFER));
            const oy = Math.max(0, Math.min(b1.y + b1.height + SOFT_BUFFER, b2.y + b2.height + SOFT_BUFFER) - Math.max(b1.y - SOFT_BUFFER, b2.y - SOFT_BUFFER));
            
            if (ox > 0 && oy > 0) {
                // Determine severity
                const hardOx = Math.max(0, Math.min(b1.x + b1.width, b2.x + b2.width) - Math.max(b1.x, b2.x));
                const hardOy = Math.max(0, Math.min(b1.y + b1.height, b2.y + b2.height) - Math.max(b1.y, b2.y));
                const isHard = hardOx > 0 && hardOy > 0;
                
                clashes.push({
                    id: `clash-${s1.id}-${s2.id}`,
                    aId: s1.id,
                    bId: s2.id,
                    at: { x: (b1.x + b1.width/2 + b2.x + b2.width/2)/2, z: (b1.y + b1.height/2 + b2.y + b2.height/2)/2 },
                    severity: isHard ? 'hard' : 'soft',
                    view: 'front'
                });
            }
        }
    }
    return clashes;
};

export const GRID_SIZE = 20;
export const findRouteAStar = async (start: Point3D, end: Point3D, shapes: Shape[], walls: Wall[] = []): Promise<Point3D[]> => {
    // A* Implementation simplified for brevity but functional
    const gridW = Math.ceil(SCREEN_W / GRID_SIZE);
    const gridH = Math.ceil(SCREEN_H / GRID_SIZE); 
    const gridD = Math.ceil(MAX_DEPTH / GRID_SIZE); 

    const occ = new Set<string>();
    
    // Rasterize shapes into grid
    shapes.forEach(s => {
        const bbox = getShapeBBox(s);
        const x1 = Math.floor(bbox.x / GRID_SIZE), x2 = Math.ceil((bbox.x + bbox.width) / GRID_SIZE);
        const z1 = Math.floor(bbox.y / GRID_SIZE), z2 = Math.ceil((bbox.y + bbox.height) / GRID_SIZE);
        for(let z=z1; z<z2; z++) 
            for(let x=x1; x<x2; x++) 
                 occ.add(`${x},${z}`); // Occupied in Front View plane
    });

    // We assume 0-depth routing in front view for simplicity unless doing full 3D
    const sN = {x: Math.floor(start.x/GRID_SIZE), z: Math.floor(start.z/GRID_SIZE)};
    const eN = {x: Math.floor(end.x/GRID_SIZE), z: Math.floor(end.z/GRID_SIZE)};
    
    const q = [{...sN, path: [sN]}];
    const visited = new Set([`${sN.x},${sN.z}`]);
    
    while(q.length) {
        const curr = q.shift()!;
        if (Math.abs(curr.x - eN.x) < 2 && Math.abs(curr.z - eN.z) < 2) {
            return curr.path.map(p => ({x: p.x*GRID_SIZE+10, y: 0, z: p.z*GRID_SIZE+10}));
        }
        
        [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dx, dz]) => {
            const nx = curr.x+dx, nz = curr.z+dz;
            if(nx>=0 && nx<gridW && nz>=0 && nz<gridH && !occ.has(`${nx},${nz}`)) {
                const key = `${nx},${nz}`;
                if(!visited.has(key)) {
                    visited.add(key);
                    q.push({x:nx, z:nz, path: [...curr.path, {x:nx, z:nz}]});
                }
            }
        });
    }
    return [start, end]; // Fallback straight line
};

export const assignIds = (shapesToId: Shape[]) => {
    let r_i = 1, c_i = 1;
    const existingIds = new Set(shapesToId.map(s => s.id).filter(Boolean));
    shapesToId.forEach(s => {
        if (!s.id || existingIds.has(s.id)) {
            let newId;
            if (s.type === "rect") {
                do { newId = `R${r_i++}`; } while (existingIds.has(newId));
            } else {
                do { newId = `C${c_i++}`; } while (existingIds.has(newId));
            }
            s.id = newId;
            s.displayName = s.displayName || newId; 
            existingIds.add(newId);
        } else if (!s.displayName) {
             s.displayName = s.id;
        }
    });
    return shapesToId;
};

export const parseBulkTextToShapes = (text: string) => {
    const shapes: Shape[] = [];
    let rectElevation = 300, pipeElevation = 600, tolerance = 0;
    text.split('\n').forEach(line => {
        let match;
        if ((match = re.DIR_BASELINE.exec(line))) rectElevation = parseInt(match[1]);
        else if ((match = re.DIR_CENTERLINE.exec(line))) pipeElevation = parseInt(match[1]);
        else if ((match = re.RECT_BASE.exec(line))) {
            const [x, att] = parseRest(match.groups!.rest);
            shapes.push({ type: 'rect', id: match.groups!.id, w: parseInt(match.groups!.w), h: parseInt(match.groups!.h), x: x||0, y: 0, attach: att as any });
        } else if ((match = re.CIRC_BASE.exec(line))) {
            const [x, att] = parseRest(match.groups!.rest);
            shapes.push({ type: 'circle', id: match.groups!.id, r: parseInt(match.groups!.r), x: x||0, y: 0, attach: att as any });
        }
    });
    return { shapes, rectElevation, pipeElevation, tolerance };
}

const parseRest = (rest: string): [number | null, Partial<Attachment> | null] => {
    let x: number | null = null;
    let attach: Partial<Attachment> | null = null;
    const tokens = rest.trim();
    const xMatch = tokens.match(re.X_POS);
    if (xMatch) x = parseFloat(xMatch[1]);
    return [x, attach];
}

export const serializeShapesToBulk = (shapes: Shape[], re: number, pe: number, tol: number) => {
    return `# Front Elevation View\nbaseline=${re}\ncenterline=${pe}\ntolerance=${tol}\n` + 
    shapes.map(s => s.type === 'rect' ? `${s.id}: ${s.w}x${s.h} @ x=${Math.round(s.x)}` : `${s.id}: r=${s.r} @ x=${Math.round(s.x)}`).join('\n');
};

/* Hallway Logic */
export const checkParallelism = (l1: LineSegment, l2: LineSegment, toleranceDeg = 2): boolean => {
    const dx1 = l1.p2.x - l1.p1.x;
    const dz1 = l1.p2.z - l1.p1.z;
    const dx2 = l2.p2.x - l2.p1.x;
    const dz2 = l2.p2.z - l2.p1.z;
    const angle1 = Math.atan2(dz1, dx1) * 180 / Math.PI;
    const angle2 = Math.atan2(dz2, dx2) * 180 / Math.PI;
    let a1 = angle1 < 0 ? angle1 + 180 : angle1;
    let a2 = angle2 < 0 ? angle2 + 180 : angle2;
    a1 = a1 % 180; a2 = a2 % 180;
    const diff = Math.abs(a1 - a2);
    const finalDiff = Math.min(diff, 180 - diff);
    return finalDiff <= toleranceDeg;
};

export const validateHallway = (hallway: Hallway, shapes: Shape[]): { isValid: boolean, violations: string[] } => {
    if (!hallway.line1 || !hallway.line2 || !hallway.isValid) return { isValid: true, violations: [] }; 

    const violations: string[] = [];
    const dx = hallway.line1.p2.x - hallway.line1.p1.x;
    const dz = hallway.line1.p2.z - hallway.line1.p1.z;
    const len = Math.hypot(dx, dz);
    const nx = -dz / len;
    const nz = dx / len;
    const proj1 = hallway.line1.p1.x * nx + hallway.line1.p1.z * nz;
    const proj2 = hallway.line2.p1.x * nx + hallway.line2.p1.z * nz;
    const minP = Math.min(proj1, proj2);
    const maxP = Math.max(proj1, proj2);

    shapes.forEach(s => {
        const bbox = getShapeBBox(s);
        const pts = [
            { x: bbox.x, z: bbox.y },
            { x: bbox.x + bbox.width, z: bbox.y },
            { x: bbox.x, z: bbox.y + bbox.height },
            { x: bbox.x + bbox.width, z: bbox.y + bbox.height }
        ];
        let outside = false;
        for (const p of pts) {
            const val = p.x * nx + p.z * nz;
            if (val < minP - 0.1 || val > maxP + 0.1) { 
                outside = true;
                break;
            }
        }
        if (outside) violations.push(s.id);
    });

    return { isValid: violations.length === 0, violations };
};

export const getHallwayPolygon = (hallway: Hallway): string => {
    if (!hallway.line1 || !hallway.line2) return '';
    const EXTENT = 5000;
    const dx1 = hallway.line1.p2.x - hallway.line1.p1.x;
    const dz1 = hallway.line1.p2.z - hallway.line1.p1.z;
    const len1 = Math.hypot(dx1, dz1);
    const ux1 = dx1 / len1; const uz1 = dz1 / len1;
    const p1_start = { x: hallway.line1.p1.x - ux1 * EXTENT, z: hallway.line1.p1.z - uz1 * EXTENT };
    const p1_end = { x: hallway.line1.p1.x + ux1 * EXTENT, z: hallway.line1.p1.z + uz1 * EXTENT };
    const dx2 = hallway.line2.p2.x - hallway.line2.p1.x;
    const dz2 = hallway.line2.p2.z - hallway.line2.p1.z;
    const len2 = Math.hypot(dx2, dz2);
    const ux2 = dx2 / len2; const uz2 = dz2 / len2;
    const p2_start = { x: hallway.line2.p1.x - ux2 * EXTENT, z: hallway.line2.p1.z - uz2 * EXTENT };
    const p2_end = { x: hallway.line2.p1.x + ux2 * EXTENT, z: hallway.line2.p1.z + uz2 * EXTENT };
    const dot = ux1 * ux2 + uz1 * uz2;
    if (dot < 0) {
        return `${p1_start.x},${p1_start.z} ${p1_end.x},${p1_end.z} ${p2_start.x},${p2_start.z} ${p2_end.x},${p2_end.z}`;
    }
    return `${p1_start.x},${p1_start.z} ${p1_end.x},${p1_end.z} ${p2_end.x},${p2_end.z} ${p2_start.x},${p2_start.z}`;
};

const SNAP_DIST = 15;
export const getSnappedPoint = (cursor: Point2D, rooms: Room[], trunks: Trunk[], gridEnabled: boolean = true): { pt: Point2D, snapped: boolean, snapType?: 'grid' | 'point' | 'mid' } => {
    let bestDist = SNAP_DIST;
    let bestPt = { ...cursor };
    let snapped = false;
    let snapType: 'grid' | 'point' | 'mid' | undefined;
    const candidates: Point2D[] = [];
    rooms.forEach(r => candidates.push(...r.points));
    trunks.forEach(t => candidates.push(t.p1, t.p2));
    for (const c of candidates) {
        const d = Math.hypot(c.x - cursor.x, c.z - cursor.z);
        if (d < bestDist) {
            bestDist = d; bestPt = c; snapped = true; snapType = 'point';
        }
    }
    if (!snapped) {
        const midPoints: Point2D[] = [];
        trunks.forEach(t => midPoints.push({ x: (t.p1.x + t.p2.x)/2, z: (t.p1.z + t.p2.z)/2 }));
        rooms.forEach(r => {
            for(let i=0; i<r.points.length; i++) {
                const p1 = r.points[i];
                const p2 = r.points[(i+1) % r.points.length];
                midPoints.push({ x: (p1.x + p2.x)/2, z: (p1.z + p2.z)/2 });
            }
        });
        for (const m of midPoints) {
            const d = Math.hypot(m.x - cursor.x, m.z - cursor.z);
            if (d < bestDist) {
                bestDist = d; bestPt = m; snapped = true; snapType = 'mid';
            }
        }
    }
    if (!snapped && gridEnabled) {
        const gx = Math.round(cursor.x / GRID_SIZE) * GRID_SIZE;
        const gz = Math.round(cursor.z / GRID_SIZE) * GRID_SIZE;
        if (Math.hypot(gx - cursor.x, gz - cursor.z) < SNAP_DIST) {
            bestPt = { x: gx, z: gz }; snapped = true; snapType = 'grid';
        }
    }
    return { pt: bestPt, snapped, snapType };
};

export const isPointClose = (p1: Point2D, p2: Point2D, dist = 5) => {
    return Math.hypot(p1.x - p2.x, p1.z - p2.z) < dist;
};

export const generateBranches = (trunks: Trunk[], endpoints: Endpoint[], options: RouteOptions): Branch[] => {
    const branches: Branch[] = [];
    const MAX_CONN_DIST = 200; 
    endpoints.forEach(ep => {
        let bestDist = Infinity;
        let bestTrunk: Trunk | null = null;
        let bestProj: Point2D | null = null;
        trunks.forEach(t => {
            const { distSq, closest } = distToSegmentSquared({ x: ep.x, y: ep.z }, { x: t.p1.x, y: t.p1.z }, { x: t.p2.x, y: t.p2.z });
            const d = Math.sqrt(distSq);
            if (d < bestDist && d < MAX_CONN_DIST) {
                bestDist = d; bestTrunk = t; bestProj = { x: closest.x, z: closest.y };
            }
        });
        if (bestTrunk && bestProj) {
            const trunkPt: Point3D = { x: bestProj.x, y: 0, z: bestProj.z };
            const extendedPt: Point3D = { x: bestProj.x, y: options.sectionDepthPx, z: bestProj.z };
            const endPt: Point3D = { x: ep.x, y: options.sectionDepthPx, z: ep.z };
            let path: Point3D[] = [trunkPt, extendedPt];
            if (options.branchStyle === 'vertical-first') {
                path.push({ x: extendedPt.x, y: options.sectionDepthPx, z: endPt.z });
                path.push(endPt);
            } else {
                 path.push(endPt);
            }
            branches.push({ id: `br-${ep.id}`, displayName: `Branch to ${ep.displayName}`, trunkId: bestTrunk.id, endpointId: ep.id, path: path });
        }
    });
    return branches;
};
