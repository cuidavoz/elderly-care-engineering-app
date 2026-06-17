import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer no se lleva bien con el bundler: lo dejamos como módulo
  // externo del lado del servidor para que Next no intente empaquetarlo.
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default nextConfig;
