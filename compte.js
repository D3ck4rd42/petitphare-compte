// La suppression du compte Petit Phare depuis une page web, sans app (ISA comptes-en-ligne : ISC-2).
// Le même parcours que l'app : un code reçu par e-mail ouvre une session neuve, puis le serveur efface
// le compte et toute famille dont c'est le seul parent (supprimer_mon_compte, ISC-1). Aucune donnée
// n'est gardée par la page : la session vit en mémoire le temps de la suppression.

const GMAIL = new Set(["gmail.com", "googlemail.com"]);

/** La forme unique d'une adresse, comme dans les apps (module famille, email.ts) : un compte par boîte. */
export function normaliserEmail(saisie) {
  const email = saisie.trim().toLowerCase();
  const arobase = email.lastIndexOf("@");
  if (arobase < 1) return email;
  const local = email.slice(0, arobase);
  const domaine = email.slice(arobase + 1);
  if (!GMAIL.has(domaine)) return email;
  const sansEtiquette = local.split("+")[0] ?? "";
  const canonique = sansEtiquette.replaceAll(".", "");
  return canonique ? `${canonique}@gmail.com` : email;
}

export function creerCompte({ url, anonKey, recuperer = globalThis.fetch.bind(globalThis) }) {
  const appel = (chemin, corps, jeton = anonKey) =>
    recuperer(`${url}${chemin}`, {
      method: "POST",
      headers: { apikey: anonKey, Authorization: `Bearer ${jeton}`, "Content-Type": "application/json" },
      body: JSON.stringify(corps),
    });

  return {
    /**
     * Demande un code pour cette adresse, sans jamais créer de compte (create_user: false) ni dire si
     * l'adresse en a un : la page affiche toujours le même message. Seul un excès de demandes est signalé.
     */
    async envoyerCode(saisie) {
      const r = await appel("/auth/v1/otp", { email: normaliserEmail(saisie), create_user: false });
      if (r.status === 429) throw new Error("Trop de demandes : réessayez dans une minute.");
    },

    /** Le code tapé ouvre une session neuve ; rien n'est rangé, la page la garde en mémoire. */
    async verifier(saisie, code) {
      const r = await appel("/auth/v1/verify", { type: "email", email: normaliserEmail(saisie), token: code.trim() });
      if (!r.ok) throw new Error("Code refusé : vérifiez-le, ou demandez-en un nouveau.");
      const o = await r.json();
      return o.access_token;
    },

    /** Efface le compte et sa famille. Rend le nombre de familles et d'appareils effacés. */
    async supprimer(jeton) {
      const r = await appel("/rest/v1/rpc/supprimer_mon_compte", {}, jeton);
      if (r.status === 403) throw new Error("Ce compte n'est parent d'aucune famille : il n'y a rien à supprimer ici.");
      if (!r.ok) throw new Error(`La suppression a échoué (${r.status}). Réessayez dans quelques minutes.`);
      return r.json();
    },
  };
}
