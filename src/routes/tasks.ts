// src/routes/tasks.ts
import { Router } from "express"
import { authenticateToken } from "../middleware/auth"
import { tasksController } from "../controllers/tasks.controller"

const router = Router()
const h = (fn: Function) => fn as any

router.use(authenticateToken)

router.get   ("/",                        h(tasksController.list))
router.get   ("/stats",                   h(tasksController.getStats))
router.get   ("/related/:type/:id",       h(tasksController.getByRelated))
router.post  ("/",                        h(tasksController.create))
router.patch ("/:id",                     h(tasksController.update))
router.patch ("/:id/status",              h(tasksController.updateStatus))
router.delete("/:id",                     h(tasksController.delete))

export default router
