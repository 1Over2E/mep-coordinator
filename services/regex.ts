// Shape parsing
export const RECT_BASE = /^\s*(?:(?<id>\w+)\s*:\s*)?(?<w>\d+)\s*[x×]\s*(?<h>\d+)(?<rest>.*)$/i;
export const CIRC_BASE = /^\s*(?:(?<id>\w+)\s*:\s*)?r\s*=\s*(?<r>\d+)(?<rest>.*)$/i;

// Global directives parsing
export const DIR_BASELINE = /^\s*baseline\s*=\s*(-?\d+)\s*$/i;
export const DIR_CENTERLINE = /^\s*centerline\s*=\s*(-?\d+)\s*$/i;
export const DIR_TOL = /^\s*tolerance\s*=\s*(-?\d+)\s*$/i;

// Attribute parsing from the 'rest' of the string
export const X_POS = /@?\s*x\s*=\s*(-?\d+)/i;
export const ATTACH = /\battach\b/i;
export const DIR = /\bdir\s*=\s*(left|right)/i;
export const RISE = /\brise\s*=\s*(-?\d+)/i;
export const LEN = /\b(len|length)\s*=\s*(\d+)/i;
export const STYLE = /\bstyle\s*=\s*(line|wall)/i;
export const THICK = /\bthick(ness)?\s*=\s*(\d+)/i;
export const AUTO = /\bauto\s*=\s*([01]|true|false)/i;
export const BSCALE = /\b(bscale|branch_scale)\s*=\s*(0(?:\.\d+)?|0?\.\d+|1(?:\.0+)?)/i;
