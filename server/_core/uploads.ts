import { existsSync, mkdirSync } from "fs";
import { unlink } from "fs/promises";
import path from "path";
import express, { type Express, type Request, type Response } from "express";
import multer from "multer";
import { nanoid } from "nanoid";
import * as db from "../db";
import { sdk } from "./sdk";

export const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

export function registerUploadRoutes(app: Express) {
  if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, `${nanoid()}${path.extname(file.originalname)}`),
  });
  const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

  // Serve uploaded files
  app.use("/uploads", express.static(UPLOAD_DIR));

  // Upload one file to a task
  app.post("/api/tasks/:taskId/attachments", upload.single("file"), async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      const taskId = Number(req.params.taskId);
      const file = req.file;
      if (!file) { res.status(400).json({ error: "no file" }); return; }
      const row = await db.createAttachment(user.id, {
        taskId,
        fileUrl: `/uploads/${file.filename}`,
        fileName: Buffer.from(file.originalname, "latin1").toString("utf8"),
        fileSize: file.size,
      });
      if (!row) {
        // not owner or db unavailable → clean the orphan file
        await unlink(file.path).catch(() => {});
        res.status(403).json({ error: "forbidden" }); return;
      }
      res.json(row);
    } catch (e) {
      res.status(401).json({ error: "unauthorized", detail: String(e) });
    }
  });

  // Delete an attachment (also unlink the file)
  app.delete("/api/attachments/:id", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      const att = await db.deleteAttachment(user.id, Number(req.params.id));
      if (!att) { res.status(404).json({ error: "not found" }); return; }
      const fileName = att.fileUrl.split("/").pop();
      if (fileName) await unlink(path.join(UPLOAD_DIR, fileName)).catch(() => {});
      res.json({ success: true });
    } catch (e) {
      res.status(401).json({ error: "unauthorized", detail: String(e) });
    }
  });
}
