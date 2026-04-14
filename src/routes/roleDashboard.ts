// src/routes/roleDashboard.ts
import { Router } from "express"
import { authenticateToken } from "../middleware/auth"
import { roleDashboardController } from "../controllers/roleDashboard.controller"

const router = Router()
const h = (fn: Function) => fn as any

router.use(authenticateToken)

router.get("/",           h(roleDashboardController.getDashboard))
router.get("/permissions",h(roleDashboardController.getPermissions))
router.get("/team",       h(roleDashboardController.getTeamOverview))

export default router
