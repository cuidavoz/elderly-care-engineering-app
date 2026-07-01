import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CuidaVoz",
    short_name: "CuidaVoz",
    description:
      "Reportes diarios, alertas e historial para el cuidado de adultos mayores.",
    start_url: "/elder",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#7c3aed",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
