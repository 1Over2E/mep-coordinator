import { Shape, Point3D, Section } from '../types';
import { useCamera } from '../hooks/useCamera';

export const applyCamera = (p: Point3D, pitch: number, yaw: number) => {
    // Yaw (around Y axis)
    const p1x = p.x * Math.cos(yaw) - p.z * Math.sin(yaw);
    const p1z = p.x * Math.sin(yaw) + p.z * Math.cos(yaw);
    
    // Pitch (around X axis)
    const p2y = p.y * Math.cos(pitch) - p1z * Math.sin(pitch);
    const p2z = p.y * Math.sin(pitch) + p1z * Math.cos(pitch);

    return { x: p1x, y: p2y, z: p2z };
};

export const projectPointToSectionPlane = (
    p: Point3D,
    s: Section,
    depth: number
): { point: { x: number; y: number }; offset: number } => {
    // Vector along section line
    const dx = s.p2.x - s.p1.x;
    const dy = s.p2.y - s.p1.y;
    const len = Math.hypot(dx, dy);

    // If degenerate line, return 0 but mark offset so consumers can ignore
    if (len < 1e-6) return { point: { x: 0, y: (depth + 40) - p.z }, offset: Number.POSITIVE_INFINITY };

    const ux = dx / len;
    const uy = dy / len;

    // Vector from p1 to point (in plan coordinates X/Y)
    const vx = p.x - s.p1.x;
    const vy = p.y - s.p1.y;

    // Distance along the cut line (dot product)
    const distAlong = vx * ux + vy * uy;

    // Signed perpendicular distance (cross product against unit vector)
    const offset = vx * (-uy) + vy * ux;

    // Y axis in section view corresponds to Z axis in world (inverted for SVG)
    return {
        point: {
            x: distAlong,
            y: (depth + 40) - p.z
        },
        offset
    };
};

export const projectToSection = (p: Point3D, s: Section, depth: number) => {
    const { point } = projectPointToSectionPlane(p, s, depth);
    return point;
};

export const projectPoint = (
    p: Point3D,
    viewType: 'top' | 'front' | 'side' | '3d' | 'section',
    width: number,
    height: number,
    depth: number,
    camera: ReturnType<typeof useCamera>,
    section?: Section
): {x: number, y: number} => {
    switch(viewType) {
        case 'top':
            return { x: p.x, y: p.y };
        case 'front':
            return { x: p.x, y: (depth + 40) - p.z };
        case 'side':
            return { x: p.y, y: (depth + 40) - p.z };
        case 'section':
            if (!section) return { x: 0, y: 0 };
            return projectToSection(p, section, depth);
        case '3d':
            const centered = { x: p.x - width/2, y: p.y - height/2, z: p.z - depth/2 };
            const rotated = applyCamera(centered, camera.pitch, camera.yaw);
            const perspective = 2;
            const scale = (depth * perspective) / ((depth * perspective) + rotated.z);
            return {
                x: rotated.x * scale + width / 2,
                y: rotated.y * scale + height / 2,
            };
    }
};


export const project = (
    shape: Shape,
    viewType: 'top' | 'front' | 'side' | '3d',
    width: number,
    height: number,
    depth: number,
): { x: number, y: number, z: number, w: number, h: number, r: number } => {
    const { x, y } = shape;
    let w = 0, h = 0, r = 0;
    if(shape.type === 'rect') {
        w = shape.w;
        h = shape.h;
    } else {
        r = shape.r;
    }

    switch(viewType) {
        case 'top':
            return { x, y, z: 0, w, h, r };
        case 'front':
             return { x, y: depth - 0, z:0, w, h: depth, r: r};
        case 'side':
            return { x: y, y: depth - 0, z:0, w: h, h: depth, r:r };
        default: // 3d
             return { x, y, z: 0, w, h, r };
    }
};