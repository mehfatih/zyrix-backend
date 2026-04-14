// src/routes/followUp.ts
import { Router } from "express"
import { authenticateToken } from "../middleware/auth"
import { followUpController } from "../controllers/followUp.controller"

const router = Router()
const h = (fn: Function) => fn as any

router.use(authenticateToken)

router.get   ("/",                  h(followUpController.list))
router.get   ("/stats",             h(followUpController.getStats))
router.get   ("/today",             h(followUpController.getToday))
router.post  ("/",                  h(followUpController.create))
router.patch ("/:id/status",        h(followUpController.updateStatus))
router.patch ("/:id/snooze",        h(followUpController.snooze))
router.delete("/:id",               h(followUpController.delete))
router.post  ("/auto-generate",     h(followUpController.autoGenerate))

export default router
