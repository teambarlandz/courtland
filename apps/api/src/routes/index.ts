// routes/index.ts — /v1 assembly. Takes the mounted sub-routers so app.ts
// stays free of domain imports; server.ts wires the real services, tests pass
// fakes. New domains mount here as their phases land.
import { Router } from "express";

interface V1Deps {
  authRouter: Router;
  adminUsersRouter: Router;
}

export function createV1Router(deps: V1Deps): Router {
  const v1 = Router();
  v1.use("/auth", deps.authRouter);
  v1.use("/admin/users", deps.adminUsersRouter);
  return v1;
}
