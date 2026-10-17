import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import { PostgresSessionStore } from "./lib/postgres-session-store";
import router from "./routes";
import { logger } from "./lib/logger";
import { rentalStripeWebhookHandler } from "./routes/rental-finance";
import { isLodgingEnabled } from "./lib/lodging-policy";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required");
}

const app: Express = express();

app.set("trust proxy", process.env.NODE_ENV === "production" ? 1 : false);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.get(/^\/(?:(?:en|ja|zh-TW|zh-CN)\/)?lodging(?:\/[^/]+)?\/?$/, (req, res, next) => {
  if (isLodgingEnabled()) return next();
  res.redirect(301, "https://primostay.jp");
});
const corsAllowedOrigins = new Set(
  (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

if (corsAllowedOrigins.size > 0) {
  app.use(cors({
    origin(origin, callback) {
      callback(null, Boolean(origin && corsAllowedOrigins.has(origin)));
    },
    credentials: true,
  }));
}
app.post(
  "/api/rental/stripe/webhook",
  express.raw({ type: "application/json" }),
  rentalStripeWebhookHandler,
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    store: new PostgresSessionStore(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    },
  }),
);

app.use("/api", router);

export default app;
