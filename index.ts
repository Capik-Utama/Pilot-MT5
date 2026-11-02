import "dotenv/config";
import express from "express";
import { createApp } from "./server/_core/app";

const app = createApp(express());

export default app;
