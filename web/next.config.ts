import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Módulos que no se llevan bien con el bundler: los dejamos como externos del
  // lado del servidor para que Next no intente empaquetarlos.
  //  - @react-pdf/renderer: generación de PDFs.
  //  - nodemailer: envío de mails por SMTP (usa APIs de Node).
  serverExternalPackages: ["@react-pdf/renderer", "nodemailer"],
};

export default nextConfig;
