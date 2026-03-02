/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @param {string | undefined} value */
const normalizeBasePath = (value) => {
  const trimmed = (value ?? "").trim();
  if (!trimmed || trimmed === "/") {
    return "";
  }

  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
};

const basePath = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH);

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,

  /**
   * If you are using `appDir` then you must comment the below `i18n` config out.
   *
   * @see https://github.com/vercel/next.js/issues/41980
   */
  i18n: {
    locales: ["en"],
    defaultLocale: "en",
  },
  ...(basePath ? { basePath } : {}),
  transpilePackages: ["geist"],
  webpack: (webpackConfig, { dev }) => {
    if (dev) {
      webpackConfig.watchOptions = {
        ...(webpackConfig.watchOptions ?? {}),
        ignored: [
          "**/.cache/**",
          "**/data/**",
          "**/docs/references/**",
          "**/public/VHS/generated/**",
        ],
      };
    }

    return webpackConfig;
  },
};

export default config;
