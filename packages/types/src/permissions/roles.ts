// permissions/roles.ts — the four application roles. The canonical definition
// lives in common/enums.ts alongside the other Postgres enums; re-exported
// here so permission code imports from one place.

import type { AppRole as AppRoleType } from "../common/enums.ts";
import { AppRole, appRoleValues } from "../common/enums.ts";

export { AppRole, appRoleValues };
export const APP_ROLES: readonly AppRoleType[] = appRoleValues;
