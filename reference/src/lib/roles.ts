export const USER_ROLES = ["md", "system_admin", "finance", "bd", "am", "intake_admin", "external_referrer", "seller_assist"] as const;
export type Role = typeof USER_ROLES[number];
