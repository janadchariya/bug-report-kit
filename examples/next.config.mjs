/** Merge these settings with the host's existing Next configuration. */
export default {
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  serverExternalPackages: ["postgres"],
};
