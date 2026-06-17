import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Mail, UserRound, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getElders,
  getFamily,
  getFamilyMembers,
  getInvites,
} from "@/lib/data/queries";
import { CreateElderDialog } from "../_components/create-elder-dialog";
import { CopyInviteLink } from "../_components/copy-invite-link";
import { EmptyState } from "../_components/empty-state";
import { InviteCaregiverDialog } from "../_components/invite-caregiver-dialog";
import { RevokeInviteButton } from "../_components/revoke-invite-button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ familyId: string }>;
}): Promise<Metadata> {
  const { familyId } = await params;
  const family = await getFamily(familyId);
  return { title: family?.nombre ?? "Familia" };
}

export default async function FamilyPage({
  params,
}: {
  params: Promise<{ familyId: string }>;
}) {
  const { familyId } = await params;
  const [family, elders, members, invites] = await Promise.all([
    getFamily(familyId),
    getElders(familyId),
    getFamilyMembers(familyId),
    getInvites(familyId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {family?.nombre}
          </h1>
          <p className="text-muted-foreground">
            Adultos mayores de esta familia. Elegí uno para ver su panel.
          </p>
        </div>
        {elders.length > 0 && <CreateElderDialog familyId={familyId} />}
      </div>

      {elders.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title="Todavía no hay adultos mayores"
          description="Sumá a la primera persona que cuidás para empezar a ver sus reportes y alertas."
          action={<CreateElderDialog familyId={familyId} />}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {elders.map((elder) => {
            const notas =
              typeof elder.metadata?.notas === "string"
                ? elder.metadata.notas
                : null;
            return (
              <Link
                key={elder.id}
                href={`/dashboard/${familyId}/${elder.id}`}
              >
                <Card className="hover:ring-primary/30 h-full transition-all hover:ring-2">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="bg-accent text-primary flex size-9 items-center justify-center rounded-full">
                        <UserRound className="size-4" />
                      </div>
                      <CardTitle className="flex-1">{elder.nombre}</CardTitle>
                      <ChevronRight className="text-muted-foreground size-4" />
                    </div>
                    {notas ? (
                      <CardDescription className="mt-2 line-clamp-2">
                        {notas}
                      </CardDescription>
                    ) : (
                      <CardDescription className="mt-2">
                        Ver reportes y alertas.
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="text-muted-foreground text-xs">
                    Agregado el{" "}
                    {new Date(elder.created_at).toLocaleDateString("es-AR")}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="bg-accent text-primary flex size-9 items-center justify-center rounded-full">
              <Users className="size-4" />
            </div>
            <div className="flex-1">
              <CardTitle>Cuidadores</CardTitle>
              <CardDescription className="mt-1">
                Quiénes colaboran en esta familia y las invitaciones pendientes.
              </CardDescription>
            </div>
            <CardAction>
              <InviteCaregiverDialog familyId={familyId} />
            </CardAction>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="flex flex-col divide-y divide-foreground/10">
            {members.map((member) => (
              <li
                key={member.profile_id}
                className="flex items-center gap-3 py-2 first:pt-0"
              >
                <div className="bg-accent text-muted-foreground flex size-8 items-center justify-center rounded-full">
                  <UserRound className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {member.nombre ?? member.email ?? "Sin nombre"}
                  </p>
                  {member.email && member.nombre ? (
                    <p className="text-muted-foreground truncate text-xs">
                      {member.email}
                    </p>
                  ) : null}
                </div>
                <Badge variant={member.rol === "owner" ? "default" : "secondary"}>
                  {member.rol === "owner" ? "Administrador" : "Cuidador"}
                </Badge>
              </li>
            ))}
          </ul>

          {invites.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Invitaciones pendientes
              </p>
              <ul className="flex flex-col divide-y divide-foreground/10">
                {invites.map((invite) => (
                  <li
                    key={invite.id}
                    className="flex flex-wrap items-center gap-3 py-2 first:pt-0"
                  >
                    <div className="bg-accent text-muted-foreground flex size-8 items-center justify-center rounded-full">
                      <Mail className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{invite.email}</p>
                      <p className="text-muted-foreground text-xs">
                        {invite.rol === "owner" ? "Administrador" : "Cuidador"}
                      </p>
                    </div>
                    <CopyInviteLink token={invite.token} />
                    <RevokeInviteButton
                      inviteId={invite.id}
                      familyId={familyId}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
