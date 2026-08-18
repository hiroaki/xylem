// Defensive limits enforced by both /api/normalize and /api/upload (shared pipeline).
export const MAX_RAW_GPX_BYTES = 2 * 1024 * 1024;
export const MAX_TRACKS = 20;
export const MAX_SEGMENTS_PER_TRACK = 20;
export const MAX_POINTS_PER_SEGMENT = 5000;
export const MAX_ROUTES = 20;
export const MAX_POINTS_PER_ROUTE = 2000;
export const MAX_WAYPOINTS = 500;
export const MAX_NAME_LENGTH = 200;
export const MIN_LONGITUDE = -180;
export const MAX_LONGITUDE = 180;
export const MIN_LATITUDE = -90;
export const MAX_LATITUDE = 90;
