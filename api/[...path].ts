import type { Request, Response } from "express";
import { createApp } from "../server/_core/app";

const app = createApp();

export default function handler(request: Request, response: Response) {
	return app(request, response);
}
