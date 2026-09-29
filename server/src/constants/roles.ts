export const ROLES = ["user", "admin"] as const;

export type Role = (typeof ROLES)[number];
