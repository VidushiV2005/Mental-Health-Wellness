import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: [
    "pg",
    "@huggingface/transformers",
    "onnxruntime-node",
  ],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};
export default config;
