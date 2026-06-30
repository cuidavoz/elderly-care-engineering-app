import "server-only";

import nodemailer from "nodemailer";

import type { FamilyRole } from "@/lib/types";

/**
 * Envío de mails transaccionales de CuidaVoz vía SMTP (Gmail, con App Password).
 *
 * Config por env (solo server-side):
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 *
 * Si falta la config (p. ej. en dev local sin SMTP), las funciones son no-op y
 * devuelven `false`: la invitación se crea igual y el link queda copiable a mano.
 */

type InviteEmailArgs = {
  to: string;
  familyName: string;
  inviterName: string;
  role: FamilyRole;
  acceptUrl: string;
};

function getTransport() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT ?? 465);

  if (!host || !user || !pass) {
    return null; // SMTP no configurado → no-op.
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = SSL implícito; 587 = STARTTLS.
    auth: { user, pass },
  });
}

function rolLabel(rol: FamilyRole): string {
  if (rol === "adulto_mayor") return "Adulto/a mayor";
  if (rol === "familiar") return "Familiar";
  return "Cuidador/a";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Manda el mail de invitación a una familia con el link de aceptación.
 * Devuelve `true` si se envió, `false` si SMTP no está configurado.
 * No lanza: ante un error de envío, lo registra y devuelve `false`.
 */
export async function sendInviteEmail(args: InviteEmailArgs): Promise<boolean> {
  const transport = getTransport();
  if (!transport) return false;

  const from =
    process.env.SMTP_FROM?.trim() ||
    `CuidaVoz <${process.env.SMTP_USER?.trim()}>`;

  const inviter = escapeHtml(args.inviterName);
  const family = escapeHtml(args.familyName);
  const rol = rolLabel(args.role);

  const subject = `${args.inviterName} te invitó a ${args.familyName} en CuidaVoz`;

  const text = [
    `${args.inviterName} te invita a participar de la familia "${args.familyName}" en CuidaVoz como ${rol}.`,
    ``,
    `Aceptá la invitación desde este link:`,
    args.acceptUrl,
    ``,
    `Si no esperabas esta invitación, podés ignorar este correo.`,
  ].join("\n");

  const html = `
  <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1f2937;">
    <h2 style="color:#111827;">CuidaVoz</h2>
    <p><strong>${inviter}</strong> te invita a participar de la familia
       <strong>${family}</strong> como <strong>${rol}</strong>.</p>
    <p style="margin: 24px 0;">
      <a href="${args.acceptUrl}"
         style="background:#7c3aed; color:#fff; padding:12px 20px; border-radius:8px;
                text-decoration:none; display:inline-block;">
        Ver invitación
      </a>
    </p>
    <p style="color:#6b7280; font-size:13px;">
      O copiá este link en tu navegador:<br>
      <a href="${args.acceptUrl}" style="color:#7c3aed;">${escapeHtml(args.acceptUrl)}</a>
    </p>
    <p style="color:#9ca3af; font-size:12px; margin-top:24px;">
      Si no esperabas esta invitación, podés ignorar este correo.
    </p>
  </div>`.trim();

  try {
    await transport.sendMail({ from, to: args.to, subject, text, html });
    return true;
  } catch (err) {
    console.error("[email] No se pudo enviar la invitación:", err);
    return false;
  }
}
