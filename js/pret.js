/* Prêt de matériel CDES — fonctionnement de l’outil
   Découpage du 05/10/2026 (V2.1). Ni donnée personnelle, ni adresse de serveur, ni secret. */
/* ---------------------------------------------------------------------------
   BRANCHEMENT — V2 (octobre 2026)
   L'adresse du serveur n'est plus écrite dans la page : chaque appareil se
   branche UNE FOIS en ouvrant le « lien de branchement » (adresse + mot de
   passe) fabriqué par la fonction lienDeBranchement() du script. Le mot de
   passe reste sur l'appareil ; il n'est jamais publié sur GitHub.
   --------------------------------------------------------------------------- */
const CONFIG = {
  WEBHOOK_URL: ''   // laisser vide
};
const VERSION_PAGE = 'V2.1 — 05/10/2026';

/* ===========================================================================
   Catalogues et valeurs de reference. Tout est modifiable dans l'appli :
   ce fichier ne porte que les valeurs de depart.
   =========================================================================== */

/* V2.1 — L'EN-TÊTE DES DOCUMENTS N'EST PLUS DANS CETTE PAGE PUBLIQUE.
   Les représentants légaux, le nom des chefs d'agence et les téléphones sont
   rangés côté serveur (propriété PRET_ENTETE) et envoyés à l'appareil une fois
   branché (réponse « ping » / « sync »). Ici, seulement des valeurs neutres,
   sans nom ni numéro, pour qu'un appareil non branché puisse quand même
   afficher quelque chose. */
const CDES = {
  raison: 'CDES — Curages Dragages et Systèmes',
  siret: '',
  siege: '',
  representants: 'ses représentants légaux',
};

const AGENCES = [
  { code: 'IDF', nom: 'Île-de-France', adresse: '', tel: '', chef: '' },
  { code: 'NA', nom: 'Nouvelle-Aquitaine', adresse: '', tel: '', chef: '' },
  { code: 'BPL', nom: 'Bretagne — Pays de la Loire', adresse: '', tel: '', chef: '' },
];

/* Applique l'en-tête reçu du serveur (et le garde dans la configuration de
   l'appareil, pour le hors-ligne). Ne remplace que ce qui est bien formé. */
function appliquerEntete(e) {
  if (!e || typeof e !== 'object') return false;
  if (e.cdes && typeof e.cdes === 'object') {
    ['raison', 'siret', 'siege', 'representants'].forEach((k) => { if (typeof e.cdes[k] === 'string') CDES[k] = e.cdes[k]; });
  }
  if (Array.isArray(e.agences) && e.agences.length) {
    const propres = e.agences.filter((a) => a && typeof a.code === 'string' && a.code)
      .map((a) => ({ code: a.code, nom: String(a.nom || a.code), adresse: String(a.adresse || ''), tel: String(a.tel || ''), chef: String(a.chef || '') }));
    if (propres.length) AGENCES.splice(0, AGENCES.length, ...propres);
  }
  return true;
}

/* --- Materiel : liste de depart, a completer par l'usage ------------------ */
const ENGINS = [];   // rempli au démarrage depuis data/listes.json

const AUTORISATION = 'Autorisation de conduite';
const MEDICALE = 'Attestation médicale';

const CACES = [];   // rempli au démarrage depuis data/listes.json

/* --- Etat des lieux contradictoire --------------------------------------- */
const CONTROLES = [];   // rempli au démarrage depuis data/listes.json

const REGLES = [];   // rempli au démarrage depuis data/listes.json

const NIVEAUX = [];   // rempli au démarrage depuis data/listes.json
const ETATS = [];   // rempli au démarrage depuis data/listes.json

/* ===========================================================================
   LISTES — chargées depuis data/listes.json (fichier séparé, non sensible).
   Une copie est gardée sur l'appareil : sans réseau, l'outil démarre avec la
   dernière liste reçue. Les tableaux gardent leur identité (on les remplit,
   on ne les remplace pas) : le reste du code est inchangé.
   =========================================================================== */
const CLE_LISTES = 'cdes.pret.listes';
const LISTES_ATTENDUES = { engins: ENGINS, caces: CACES, controles: CONTROLES, regles: REGLES, niveaux: NIVEAUX, etats: ETATS };
function appliquerListes(l) {
  if (!l || typeof l !== 'object') return false;
  if (!Object.keys(LISTES_ATTENDUES).every((k) => Array.isArray(l[k]) && l[k].length)) return false;
  Object.keys(LISTES_ATTENDUES).forEach((k) => { const t = LISTES_ATTENDUES[k]; t.splice(0, t.length, ...l[k]); });
  return true;
}
async function chargerListes() {
  try {
    const r = await fetch('data/listes.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const l = await r.json();
    if (!appliquerListes(l)) throw new Error('listes incomplètes');
    try { localStorage.setItem(CLE_LISTES, JSON.stringify(l)); } catch (e) { /* stockage plein : tant pis */ }
    return 'reseau';
  } catch (e) {
    let copie = null;
    try { copie = JSON.parse(localStorage.getItem(CLE_LISTES) || 'null'); } catch (e2) { copie = null; }
    return appliquerListes(copie) ? 'copie' : 'echec';
  }
}


/* ===========================================================================
   Les deux documents produits par l'outil :
     1. la convention de mise a disposition (entreprise <-> entreprise)
     2. la fiche de pret par conducteur exterieur
   =========================================================================== */
const C = {
  navy: '#002F43', cyan: '#00A9E7', anis: '#8C9E00', ardoise: '#3C7088',
  fond: '#F5F8FA', bord: '#E3EBF0', texte: '#12283A', doux: '#5B7387',
  rouge: '#C0392B', ambre: '#B8730B', vert: '#2E7D52',
};

/* ---------- petits utilitaires ------------------------------------------ */
function dfr(iso) {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
function ou(v, d) { const s = (v == null ? '' : String(v)).trim(); return s || (d === undefined ? '—' : d); }
function perime(iso, ref) {
  if (!iso) return false;
  return new Date(iso) < new Date(ref || new Date().toISOString().slice(0, 10));
}

/* ---------- en-tete / pied de page -------------------------------------- */
function enTeteDe(titre, sousTitre, ref) {
  return (d) => {
    d.image(d.logo(), d.gauche, 28, 88, 88 * LOGO_CDES.h / LOGO_CDES.w);
    d.texte(titre, d.droite, 30, { taille: 12.5, style: 'b', align: 'droite', couleur: C.navy });
    d.texte(sousTitre, d.droite, 45.5, { taille: 8.2, align: 'droite', couleur: C.ardoise });
    if (ref) d.texte(ref, d.droite, 56, { taille: 7.6, style: 'b', align: 'droite', couleur: C.cyan });
    d.ligne(d.gauche, 72, d.droite, 72, { couleur: C.cyan, lw: 1.4 });
  };
}
function piedDe(mention) {
  return (d, page, total) => {
    const y = d.H - 38;
    d.ligne(d.gauche, y, d.droite, y, { couleur: C.bord, lw: 0.6 });
    d.texte(mention, d.gauche, y + 6, { taille: 6.8, couleur: C.doux });
    d.texte(`Page ${page} / ${total}`, d.droite, y + 6, { taille: 6.8, style: 'b', couleur: C.ardoise, align: 'droite' });
  };
}

/* ---------- briques partagees -------------------------------------------- */
/** Carte "partie" : titre colore + lignes. Renvoie la hauteur. */
function carte(d, x, y, w, titre, lignes, accent) {
  const inter = 11.5;
  const corps = [];
  lignes.forEach((l) => couper(l.t, w - 20, l.fort ? 9 : 8.6, l.fort ? 'b' : 'n')
    .forEach((ln, i) => corps.push({ t: ln, fort: l.fort, gris: l.gris, saut: i === 0 ? l.saut : 0 })));
  let h = 24;
  corps.forEach((c) => { h += inter + (c.saut || 0); });
  h += 8;
  d.rect(x, y, w, h, { fill: '#FFFFFF', stroke: C.bord, lw: 0.8, r: 3 });
  d.rect(x, y, w, 3, { fill: accent || C.cyan, r: 1.5 });
  d.texte(titre.toUpperCase(), x + 10, y + 9, { taille: 7, style: 'b', couleur: accent || C.cyan });
  let cy = y + 22;
  corps.forEach((c) => {
    cy += c.saut || 0;
    d.texte(c.t, x + 10, cy, { taille: c.fort ? 9 : 8.6, style: c.fort ? 'b' : 'n',
      couleur: c.gris ? C.doux : C.texte });
    cy += inter;
  });
  return h;
}

/** Deux cartes cote a cote, alignees sur la plus haute. */
function deuxCartes(d, a, b) {
  const w = (d.large - 12) / 2;
  const simuler = (c) => carte({ rect: () => {}, texte: () => {}, H: d.H, gauche: d.gauche },
    0, 0, w, c.titre, c.lignes, c.accent);
  const h = Math.max(simuler(a), simuler(b));
  d.place(h + 8);
  carte(d, d.gauche, d.y, w, a.titre, a.lignes, a.accent);
  carte(d, d.gauche + w + 12, d.y, w, b.titre, b.lignes, b.accent);
  d.y += h + 10;
}

/** Encadre d'alerte / d'information. */
function encadre(d, titre, texte, couleur, ic) {
  const w = d.large;
  const lignes = couper(texte, w - 24, 8.6, 'n');
  const h = 20 + lignes.length * 11.5 + 6;
  d.place(h + 6);
  d.rect(d.gauche, d.y, w, h, { fill: '#FFFFFF', stroke: couleur, lw: 0.9, r: 3 });
  d.rect(d.gauche, d.y, 3.5, h, { fill: couleur, r: 1.5 });
  d.texte((ic ? ic + '  ' : '') + titre.toUpperCase(), d.gauche + 12, d.y + 7,
    { taille: 7.4, style: 'b', couleur });
  lignes.forEach((l, i) => d.texte(l, d.gauche + 12, d.y + 19 + i * 11.5, { taille: 8.6, couleur: C.texte }));
  d.y += h + 8;
  return h;
}

/** Coupe un texte a la largeur disponible, avec des points de suspension. */
function tronquer(txt, max, taille, style) {
  const t = String(txt == null ? '' : txt);
  if (max <= 0 || largeur(t, taille, style) <= max) return t;
  let n = t.length;
  while (n > 1 && largeur(t.slice(0, n) + '…', taille, style) > max) n--;
  return t.slice(0, n) + '…';
}

/** Dessine une signature vectorielle dans une boite. */
function dessinerSignature(d, x, y, w, h, sig) {
  if (!sig || !sig.traits || !sig.traits.length) return;
  // les traits sont normalises 0..1 sur une boite de rapport sig.a (largeur/hauteur)
  const a = sig.a || 2.4;
  let dw = w, dh = w / a;
  if (dh > h) { dh = h; dw = h * a; }
  const ox = x + (w - dw) / 2, oy = y + (h - dh) / 2;
  sig.traits.forEach((tr) => {
    d.trace(tr.map((p) => ({ x: ox + p[0] * dw, y: oy + p[1] * dh })), { lw: 1.1, couleur: '#12283A' });
  });
}

/** Bloc de signatures : n boites cote a cote. */
function blocSignatures(d, boites, o) {
  o = o || {};
  const n = boites.length;
  const ecart = 10;
  const w = (d.large - ecart * (n - 1)) / n;
  const h = o.h || 96;
  d.place(h + 12);
  boites.forEach((b, i) => {
    const x = d.gauche + i * (w + ecart);
    d.rect(x, d.y, w, h, { fill: '#FFFFFF', stroke: C.bord, lw: 0.8, r: 3 });
    d.rect(x, d.y, w, 16, { fill: b.accent || C.navy, r: 3 });
    d.rect(x, d.y + 12, w, 4, { fill: b.accent || C.navy });
    d.texte(b.role.toUpperCase(), x + 8, d.y + 4,
      { taille: 7, style: 'b', couleur: b.couleurRole || '#FFFFFF' });
    d.texte('Signature précédée de la mention « Lu et approuvé »', x + 8, d.y + 20,
      { taille: 6.2, style: 'i', couleur: C.doux });
    dessinerSignature(d, x + 8, d.y + 29, w - 16, 34, b.sig);
    d.ligne(x + 8, d.y + 66, x + w - 8, d.y + 66, { couleur: C.bord, lw: 0.6 });
    d.texte(tronquer(ou(b.nom, '') || '', w - 16, 8.4, 'b'), x + 8, d.y + 70,
      { taille: 8.4, style: 'b', couleur: C.texte });
    // la date est prioritaire sur la qualité : on rogne la qualité pour qu'elles ne se croisent pas
    const dat = b.date ? 'Le ' + dfr(b.date) : '';
    const wDate = dat ? largeur(dat, 7.2, 'n') + 8 : 0;
    d.texte(tronquer(ou(b.qualite, ''), w - 16 - wDate, 7.2, 'n'), x + 8, d.y + 80.5,
      { taille: 7.2, couleur: C.doux });
    if (dat) d.texte(dat, x + w - 8, d.y + 80.5, { taille: 7.2, couleur: C.doux, align: 'droite' });
  });
  d.y += h + 10;
}

/* ===========================================================================
   1. CONVENTION DE MISE A DISPOSITION
   =========================================================================== */


/* ===========================================================================
   2. FICHE DE PRET DE MATERIEL (conducteur exterieur)
   =========================================================================== */
/** Bandeau de separation entre les deux parties du document. */
function separateur(d, num, titre, sousTitre) {
  d.place(60);
  d.rect(d.gauche, d.y, d.large, 44, { fill: C.navy, r: 3 });
  d.texte('PARTIE ' + num, d.gauche + 14, d.y + 8,
    { taille: 7, style: 'b', couleur: C.cyan });
  d.texte(titre.toUpperCase(), d.gauche + 14, d.y + 19,
    { taille: 11.5, style: 'b', couleur: '#FFFFFF' });
  if (sousTitre) d.texte(sousTitre, d.droite - 14, d.y + 21,
    { taille: 8.4, couleur: '#9FC6D9', align: 'droite' });
  d.y += 54;
}

/* ===========================================================================
   LE DOCUMENT : convention de mise a disposition + fiche de pret, en un seul PDF
   =========================================================================== */
function genererDocument(D) {
  const ag = AGENCES.find((a) => a.code === D.agence) || AGENCES[0];
  const ref = D.ref || 'PRET-—';
  const refConv = D.convention.ref || ref.replace('PRET', 'CONV');
  const m0 = (D.materiel && D.materiel[0]) || {};
  const cd = D.conducteur;
  const emp = D.signatures.emprunteur;
  const nomCond = ((cd.prenom || '') + ' ' + (cd.nom || '')).trim();
  const nomCdes = ((D.signatures.cdes.prenom || '') + ' ' + (D.signatures.cdes.nom || '')).trim();
  const employeur = D.emprunteur.raison || '';
  const jour = D.etat.remise.date || new Date().toISOString().slice(0, 10);

  const d = new PdfDoc({
    meta: { titre: 'Prêt de matériel — ' + ref,
      sujet: ou(D.emprunteur.raison, '') + ' — ' + ou(nomCond, '') + ' — ' + ou(m0.designation, '') },
  });
  d.enTete = enTeteDe('Prêt de matériel', 'Convention et fiche de prêt', ref);
  d.nouvellePage();

  /* =====================================================================
     PARTIE 1 — CONVENTION
     ===================================================================== */
  separateur(d, 1, 'Convention de mise à disposition',
    ou(D.convention.objetCourt, 'Matériel de chantier'));

  d.h2('Entre les soussignés', { avant: 0 });
  deuxCartes(d,
    { titre: 'Le prêteur', accent: C.cyan, lignes: [
      { t: CDES.raison, fort: true },
      { t: 'SIRET ' + CDES.siret, gris: true },
      { t: CDES.siege },
      { t: 'Représenté par ' + CDES.representants, saut: 4 },
      { t: 'Agence ' + ag.nom + ' — ' + ag.tel, gris: true, saut: 4 },
    ] },
    { titre: "L'emprunteur", accent: C.anis, lignes: [
      { t: ou(D.emprunteur.raison, 'À COMPLÉTER'), fort: true },
      { t: D.emprunteur.siret ? 'SIRET ' + D.emprunteur.siret : ' ', gris: true },
      { t: ou(D.emprunteur.adresse, ' ') },
      { t: 'Représenté par ' + ou(D.emprunteur.representant, '…'), saut: 4 },
      { t: [D.emprunteur.tel, D.emprunteur.mail].filter(Boolean).join(' — ') || ' ', gris: true, saut: 4 },
    ] });

  d.para('Il a été convenu ce qui suit :', { style: 'i', taille: 9, couleur: C.doux, apres: 4 });

  const art = (n, t) => d.h2('Article ' + n + ' — ' + t);
  const p = (t) => d.para(t, { justifie: true, apres: 2 });

  art(1, "Objet de la convention");
  p("Le prêteur accepte de mettre à disposition de l'emprunteur le matériel désigné à l'article 4, " +
    "en vue de l'activité suivante : " + ou(D.convention.objet, '…') + ".");

  art(2, 'Durée et lieu');
  p("Le matériel est mis à disposition du " + ou(dfr(D.convention.du), '…') + " au " +
    ou(dfr(D.convention.au), '…') + ". L'emprunteur s'engage à l'utiliser directement et exclusivement sur " +
    "le site suivant : " + ou(D.chantier.lieu, '…') + ". Toute utilisation en dehors de ce périmètre ou de " +
    "cette période nécessite l'accord écrit préalable du prêteur.");

  art(3, 'Conditions financières');
  p("La présente convention est consentie à titre gratuit. Les consommables, le carburant et les frais " +
    "d'exploitation courants restent à la charge de l'emprunteur.");

  art(4, 'Inventaire du matériel mis à disposition');
  d.tableau({
    cols: [{ l: 'Désignation', w: 42, style: 'b' }, { l: 'Marque et modèle', w: 22 },
           { l: 'N° de parc', w: 16 }, { l: 'N° de série', w: 20 }],
    rows: (D.materiel || []).map((m) => [ou(m.designation),
      [m.marque, m.modele].filter(Boolean).join(' ') || '—', ou(m.parc), ou(m.serie)]),
    apres: 6,
  });
  p("Le matériel est mis à disposition à compter du " + ou(dfr(D.convention.du), '…') + ". " +
    "L'emprunteur s'engage à prévenir systématiquement le prêteur dès qu'il a besoin d'utiliser " +
    "l'équipement. Après chaque utilisation, il s'engage à le restituer dans son état initial, " +
    "propre et avec les pleins réalisés.");

  art(5, 'Conducteurs autorisés');
  p("Seuls les conducteurs expressément désignés par l'emprunteur et titulaires d'une autorisation de " +
    "conduite en cours de validité, délivrée par leur propre employeur au titre des articles R. 4323-55 " +
    "à R. 4323-57 du code du travail, sont admis à utiliser le matériel. Pour chacun d'eux, la fiche de " +
    "prêt qui constitue la seconde partie du présent document est établie contradictoirement avant la " +
    "première utilisation. L'emprunteur tient à disposition du prêteur les justificatifs correspondants.");

  art(6, 'Propriété');
  p("Le matériel reste la propriété du prêteur. La présente convention n'implique aucun transfert de " +
    "droits sur le matériel. L'emprunteur n'a pas le droit de le prêter à son tour, ni de le " +
    "sous-louer, ni de le déplacer hors du site convenu.");

  art(7, 'Responsabilités et assurances');
  p("Le prêteur assure l'entretien courant de l'équipement ainsi que la réalisation des vérifications " +
    "générales périodiques (VGP) conformément à la réglementation en vigueur, et remet le matériel en " +
    "état de conformité.");
  p("L'emprunteur s'engage à contracter les assurances nécessaires pour couvrir les risques liés à " +
    "l'utilisation du matériel sur le lieu de l'activité, notamment le vol, le dégât des eaux, " +
    "l'incendie, les événements naturels et tout acte de vandalisme. Il en justifie à première demande " +
    "du prêteur.");
  p("L'emprunteur assume l'entière responsabilité du matériel dès sa prise en charge et jusqu'à sa " +
    "restitution. Il est seul responsable de tous dégâts causés au matériel ou du fait du matériel, " +
    "quelle qu'en soit la cause ou la nature. Tout matériel manquant ou dégradé devra être remplacé ou " +
    "réparé par et à la charge de l'emprunteur.");
  p("L'emprunteur s'engage à vérifier l'état général de la machine et de ses équipements de sécurité " +
    "avant chaque utilisation. Toute anomalie constatée doit être immédiatement signalée au prêteur, et " +
    "l'utilisation de la machine interrompue en cas de défaillance pouvant compromettre la sécurité.");
  p("En cas de casse, de perte ou de vol, l'emprunteur s'engage à effectuer les démarches nécessaires à " +
    "la prise en charge du dommage par sa compagnie d'assurance, et à en informer le prêteur sous " +
    "quarante-huit heures.");
  p("L'emprunteur s'engage à utiliser le matériel conformément à la notice d'utilisation et à en " +
    "respecter les règles de sécurité.");

  art(8, 'Résiliation');
  p("Chacune des parties peut, à tout moment et pour tout motif, résilier la présente convention. La " +
    "partie qui souhaite résilier notifie son intention à l'autre par lettre recommandée avec accusé de " +
    "réception, au moins une semaine avant la date retenue pour la résiliation.");

  art(9, 'Règlement des litiges');
  p("Les parties s'engagent à rechercher une solution amiable à tout différend né de l'application ou " +
    "de l'interprétation de la présente convention. À défaut de solution amiable, le litige sera tranché " +
    "par le tribunal compétent.");

  d.y += 4;
  d.para('Fait en deux exemplaires originaux, à ' + ou(D.convention.lieuSignature, 'LUZANCY') +
    ', le ' + ou(dfr(D.convention.dateSignature), '…') +
    '. Les signatures figurent en dernière page.', { taille: 9, apres: 4 });

  /* =====================================================================
     PARTIE 2 — FICHE DE PRET
     ===================================================================== */
  d.nouvellePage();
  separateur(d, 2, 'Fiche de prêt de matériel', 'Conducteur extérieur');

  d.rect(d.gauche, d.y, d.large, 46, { fill: C.fond, r: 3, stroke: C.bord, lw: 0.8 });
  d.texte(ou(nomCond, 'CONDUCTEUR À RENSEIGNER').toUpperCase(), d.gauche + 14, d.y + 9,
    { taille: 12.5, style: 'b', couleur: C.navy });
  d.texte(ou(employeur, ''), d.gauche + 14, d.y + 25, { taille: 8.6, couleur: C.doux });
  d.texte(ou(m0.designation, ''), d.droite - 14, d.y + 11,
    { taille: 9.4, style: 'b', couleur: C.cyan, align: 'droite' });
  d.texte(m0.parc ? 'N° de parc ' + m0.parc : '', d.droite - 14, d.y + 25,
    { taille: 8, couleur: C.doux, align: 'droite' });
  d.y += 56;

  /* --- 1. le conducteur --- */
  d.h2("1 · Identité du conducteur de l'engin");
  d.champs([
    { k: 'Nom et prénom', v: ou(nomCond), fort: true },
    { k: 'Téléphone', v: ou(cd.tel) },
    { k: 'Né le', v: ou(dfr(cd.ne)) },
    { k: 'Employeur', v: ou(employeur) },
  ], { cols: 2 });

  /* --- 2. habilitations --- */
  d.h2('2 · Formation, autorisation de conduite et aptitude');
  const aPhoto = (cle) => (cd.photos || []).some((x) => x.cle === cle);
  const lignesH = (cd.habilitations || []).map((x) => {
    const justif = cd.aTransmettre ? 'À transmettre'
      : ([x.vu ? 'Vu' : null, aPhoto(x.id) ? 'Photo jointe' : null].filter(Boolean).join(' + ') || '—');
    return [
      x.type, ou(x.cat, '—'),
      (dfr(x.validite) || '—') + (perime(x.validite, jour) ? '   PÉRIMÉ' : ''),
      justif,
    ];
  });
  if (!lignesH.length) lignesH.push([AUTORISATION, '—', '—', 'Non renseignée']);
  d.tableau({
    cols: [{ l: 'Titre', w: 34, style: 'b' }, { l: 'Catégorie', w: 20, align: 'centre' },
           { l: 'Valable jusqu’au', w: 24, align: 'centre' },
           { l: 'Justificatif', w: 22, align: 'centre' }],
    rows: lignesH,
    fondLigne: (r) => (/PÉRIMÉ/.test(r[2]) || r[3] === 'À transmettre' || r[3] === 'Non renseignée'
      ? '#FBEAE7' : null),
    apres: 6,
  });

  const bloquants = [];
  (cd.habilitations || []).forEach((x) => {
    if (perime(x.validite, jour)) bloquants.push(x.type + (x.cat ? ' ' + x.cat : '') + ' est périmé');
  });
  if (!cd.aTransmettre && !(cd.habilitations || []).some((x) => x.type === AUTORISATION)) {
    bloquants.push("aucune autorisation de conduite n'est renseignée");
  }
  if (cd.aTransmettre) {
    encadre(d, 'Justificatifs non fournis — pas de conduite sans autorisation',
      'Le conducteur ne dispose pas de ses documents au moment de la remise. Ils doivent être transmis à ' +
      'CDES' + (cd.delaiTransmission ? ' au plus tard le ' + dfr(cd.delaiTransmission) : '') +
      ". Tant qu'ils ne l'ont pas été, la conduite de l'engin ne peut pas lui être confiée.",
      C.rouge, '!');
  } else if (bloquants.length) {
    encadre(d, 'Prêt à ne pas réaliser en l’état',
      'Point bloquant : ' + bloquants.join(' ; ') + ". La conduite ne peut pas être confiée tant que " +
      "ce point n'est pas régularisé par l'employeur du conducteur.", C.rouge, '!');
  }

  /* --- 3. l'engin confie --- */
  d.h2("3 · L'engin confié");
  d.champs([
    { k: 'Désignation', v: ou(m0.designation), fort: true },
    { k: 'Marque et modèle', v: [m0.marque, m0.modele].filter(Boolean).join(' ') || '—' },
    { k: 'N° de parc', v: ou(m0.parc) },
    { k: 'N° de série', v: ou(m0.serie) },
    { k: 'Année', v: ou(m0.annee) },
    { k: 'CACES requis pour cet engin', v: ou(m0.caces) },
  ], { cols: 3 });
  d.champs([{ k: 'Équipements et accessoires associés', v: ou(m0.accessoires, 'Aucun') }],
    { cols: 1, apres: 2 });

  /* --- 4. etat des lieux contradictoire --- */
  d.h2('4 · État des lieux contradictoire');
  d.para("Constat contradictoire réalisé devant l'engin le " +
    ou(dfr(D.etat.remise.date), '…') + '.', { taille: 8, style: 'i', couleur: C.doux, apres: 6 });
  d.tableau({
    cols: [{ l: 'Point contrôlé', w: 52, style: 'n' }, { l: 'Constat', w: 18, align: 'centre', style: 'b' },
           { l: 'Observation', w: 30 }],
    rows: CONTROLES.map((c, i) => {
      const r = (D.etat.remise.points || {})[i] || {};
      return [c.l, ou(r.etat, ''), ou(r.obs, '')];
    }),
    fondLigne: (r) => (r[1] === 'Anomalie' ? '#FDF3E7' : null),
    apres: 8,
  });
  if (D.etat.remise.obs) encadre(d, 'Observations à la remise', D.etat.remise.obs, C.ardoise, 'i');

  /* --- 5. engagement --- */
  d.h2('5 · Engagement du conducteur');
  d.para("En signant cette fiche, je reconnais avoir reçu l'engin désigné ci-dessus, en avoir vérifié " +
    "l'état contradictoirement, avoir pris connaissance du plan de prévention du chantier et de ses " +
    'consignes de sécurité, et je m’engage à :', { taille: 8.8, apres: 6 });
  REGLES.forEach((r, i) => {
    const lignes = couper(r, d.large - 22, 8.6, 'n');
    d.place(lignes.length * 11.5 + 5);
    d.rect(d.gauche, d.y - 0.5, 13, 11, { fill: C.fond, r: 2 });
    d.texte(String(i + 1), d.gauche + 6.5, d.y + 1, { taille: 7.4, style: 'b', couleur: C.ardoise, align: 'centre' });
    lignes.forEach((l, k) => d.texte(l, d.gauche + 20, d.y + k * 11.5, { taille: 8.6, couleur: C.texte }));
    d.y += lignes.length * 11.5 + 3.5;
  });
  d.y += 6;

  /* =====================================================================
     DERNIÈRE PAGE — les trois signatures, côte à côte
     ===================================================================== */
  d.nouvellePage();
  d.h2('Signatures', { avant: 0 });
  d.champs([
    { k: 'Référence', v: ref + '  ·  ' + refConv, fort: true },
    { k: 'Matériel', v: ou(m0.designation) + (m0.parc ? '  ·  n° de parc ' + m0.parc : '') },
    { k: 'Emprunteur', v: ou(D.emprunteur.raison) },
    { k: 'Conducteur', v: ou(nomCond) },
    { k: 'Période de prêt', v: 'du ' + (dfr(D.convention.du) || '…') + ' au ' + (dfr(D.convention.au) || '…') },
    { k: 'Remise du matériel', v: D.signatures.conducteur.traits ? 'le ' + dfr(D.etat.remise.date) : 'à réaliser' },
  ], { cols: 2, apres: 4 });

  if (emp.distance && !(emp.traits && emp.traits.length)) {
    encadre(d, 'Convention en attente de signature',
      "L'emprunteur n'étant pas présent, le lien de signature lui a été adressé" +
      (emp.envoyeeLe ? ' le ' + dfr(emp.envoyeeLe) : '') + (emp.mail ? ' à ' + emp.mail : '') +
      '. La mise à disposition sera régularisée dès sa signature.', C.ambre, '!');
  }

  blocSignatures(d, [
    { role: 'Le prêteur — CDES', accent: C.cyan, nom: nomCdes,
      qualite: 'Agence ' + ag.nom, date: D.convention.dateSignature, sig: D.signatures.cdes },
    { role: "L'emprunteur", accent: C.anis, nom: ou(emp.nom, ''),
      qualite: ou(D.emprunteur.raison, ''),
      date: (emp.traits && emp.traits.length) ? (emp.signeeLe || D.convention.dateSignature) : '',
      sig: emp },
    { role: 'Le conducteur', accent: C.ardoise, nom: ou(nomCond, ''),
      qualite: ou(employeur, ''), date: D.signatures.conducteur.traits ? D.etat.remise.date : '',
      sig: D.signatures.conducteur },
  ], { h: 118 });

  /* --- restitution : une case, et un mot s'il y a lieu --- */
  d.h2('Restitution du matériel');
  if (D.etat.retour.date) {
    d.place(40);
    d.case_(d.gauche, d.y, !!D.etat.retour.identique, { taille: 10 });
    d.texte('Équipement restitué identique à l’état initial, le ' + dfr(D.etat.retour.date),
      d.gauche + 16, d.y + 0.5, { taille: 9, style: 'b', couleur: C.texte });
    d.y += 20;
    if (!D.etat.retour.identique) {
      encadre(d, 'Réserves à la restitution',
        ou(D.etat.retour.commentaire, 'Réserves émises, sans précision.'), C.rouge, '!');
    }
  } else {
    d.place(40);
    d.case_(d.gauche, d.y, false, { taille: 10 });
    d.texte('Équipement restitué identique à l’état initial, le  ......  /  ......  /  ..........',
      d.gauche + 16, d.y + 0.5, { taille: 9, couleur: C.texte });
    d.y += 18;
    d.texte('Sinon, préciser : ..........................................................................' +
      '..........................................', d.gauche, d.y, { taille: 8.4, couleur: C.doux });
    d.y += 16;
  }

  /* --- annexe photos --- */
  const photos = [].concat(
    (cd.photos || []).map((x) => ({ p: x, l: 'Justificatif' })),
    (D.etat.remise.photos || []).map((x) => ({ p: x, l: 'Remise — ' + dfr(D.etat.remise.date) })));
  if (photos.length) {
    d.nouvellePage();
    d.h2('Annexe · Justificatifs et état des lieux', { avant: 0 });
    const cols = 2, ecart = 12;
    const w = (d.large - ecart * (cols - 1)) / cols;
    for (let i = 0; i < photos.length; i += cols) {
      const rangee = photos.slice(i, i + cols);
      const HMAX = 195;   // hauteur commune : portraits et paysages s'alignent
      const dims = rangee.map((r) => {
        let hh = w * r.p.h / r.p.w, ww = w;
        if (hh > HMAX) { hh = HMAX; ww = HMAX * r.p.w / r.p.h; }
        return { ww, hh };
      });
      const hmax = Math.max(...dims.map((v) => v.hh));
      d.place(hmax + 28);
      rangee.forEach((r, j) => {
        const x = d.gauche + j * (w + ecart) + (w - dims[j].ww) / 2;
        d.image(d.jpeg(r.p.b64, r.p.w, r.p.h), x, d.y, dims[j].ww, dims[j].hh);
        d.rect(x, d.y, dims[j].ww, dims[j].hh, { stroke: C.bord, lw: 0.8 });
        d.texte((r.p.legende ? r.p.legende + ' — ' : '') + r.l,
          d.gauche + j * (w + ecart), d.y + hmax + 5, { taille: 7.2, couleur: C.doux });
      });
      d.y += hmax + 22;
    }
  }

  d.finaliser(piedDe(ref + '  ·  ' + refConv + '  ·  ' + ou(nomCond, '') + '  ·  ' +
    ou(m0.designation, '') + '  ·  CDES ' + ag.nom));
  return d;
}

/* ===========================================================================
   Application — parcours de saisie, signatures, photos, synchronisation.
   Aucune bibliotheque externe.
   =========================================================================== */

/* ---------- petits outils DOM (jamais d'innerHTML sur des donnees) -------- */
function h(tag, attrs, enfants) {
  const e = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'style') e.setAttribute('style', v);
      else if (k === 'texte') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;              // uniquement des litteraux
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k in e && k !== 'list' && k !== 'type' && k !== 'step') e[k] = v;
      else e.setAttribute(k, v);
    }
  }
  (Array.isArray(enfants) ? enfants : enfants ? [enfants] : []).forEach((c) => {
    if (c == null || c === false) return;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return e;
}
const $ = (s, r) => (r || document).querySelector(s);
function vider(e) { while (e.firstChild) e.removeChild(e.firstChild); return e; }
function toast(msg, type) {
  const t = h('div', { class: 'toast' + (type ? ' ' + type : ''), texte: msg });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), type === 'e' ? 6000 : 3200);
}
const auj = () => new Date().toISOString().slice(0, 10);
function uid() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

/* ===========================================================================
   Modele
   =========================================================================== */
function nouveauDossier(agence) {
  return {
    id: uid(), ref: '', agence: agence || 'IDF', maj: Date.now(), statut: 'brouillon',
    chantier: { nom: '', lieu: '' },
    emprunteur: { raison: '', siret: '', adresse: '', representant: '', tel: '', mail: '' },
    convention: { ref: '', objetCourt: '', objet: '', du: '', au: '',
      lieuSignature: 'LUZANCY', dateSignature: auj() },
    materiel: [{ designation: '', marque: '', modele: '', parc: '', serie: '', annee: '',
      compteur: '', caces: '', accessoires: '' }],
    conducteur: {
      nom: '', prenom: '', ne: '', tel: '',
      habilitations: [],
      aTransmettre: false, delaiTransmission: '',
      photos: [],
    },
    etat: {
      remise: { date: auj(), obs: '', points: {}, photos: [] },
      // au retour, on ne refait pas un etat des lieux : une case, et un mot s'il y a lieu
      retour: { date: '', identique: true, commentaire: '' },
    },
    signatures: {
      // le redacteur CDES est aussi le signataire : une seule identite, une seule signature
      cdes: { nom: '', prenom: '' },
      emprunteur: { nom: '', distance: false, mail: '', envoyeeLe: '', jeton: '', signeeLe: '' },
      conducteur: {},
    },
  };
}

/** Complete un dossier venu d'une version anterieure (ou du serveur). */
function normaliser(D) {
  const n = nouveauDossier(D.agence);
  // On parcourt les cles de la SOURCE : parcourir celles du modele perdrait tout
  // ce qui est libre, a commencer par les points de l'etat des lieux.
  const fusion = (cible, source) => {
    if (source == null || typeof source !== 'object') return cible;
    Object.keys(source).forEach((k) => {
      const a = cible[k], b = source[k];
      if (a && typeof a === 'object' && !Array.isArray(a) &&
          b && typeof b === 'object' && !Array.isArray(b)) fusion(a, b);
      else cible[k] = b;
    });
    return cible;
  };
  const out = fusion(n, D);
  out.id = D.id || out.id;
  if (!Array.isArray(out.materiel) || !out.materiel.length) out.materiel = n.materiel;
  if (!Array.isArray(out.conducteur.habilitations)) out.conducteur.habilitations = [];
  out.conducteur.habilitations.forEach((x) => { if (!x.id) x.id = uid(); });
  if (!Array.isArray(out.conducteur.photos)) out.conducteur.photos = [];
  out.conducteur.employeur = out.emprunteur.raison || '';
  if (!out.etat.remise.points || typeof out.etat.remise.points !== 'object') out.etat.remise.points = {};
  if (!Array.isArray(out.etat.remise.photos)) out.etat.remise.photos = [];
  return out;
}

/* ===========================================================================
   Stockage : dossiers en localStorage, photos en IndexedDB (quota)
   =========================================================================== */
const CLE = 'cdes.pret.v1';
const CLE_CONF = 'cdes.pret.conf';

const Store = {
  lire() {
    try {
      const b = JSON.parse(localStorage.getItem(CLE) || '{}');
      return { dossiers: b.dossiers || {}, pierres: b.pierres || {} };
    } catch (e) { return { dossiers: {}, pierres: {} }; }
  },
  ecrire(b) {
    try { localStorage.setItem(CLE, JSON.stringify(b)); return true; }
    catch (e) { toast("Mémoire du navigateur pleine : le dossier n'a pas pu être enregistré localement.", 'e'); return false; }
  },
  conf() { try { return JSON.parse(localStorage.getItem(CLE_CONF) || '{}'); } catch (e) { return {}; } },
  majConf(o) { localStorage.setItem(CLE_CONF, JSON.stringify(Object.assign(this.conf(), o))); },
};

/* --- photos : IndexedDB, jamais en localStorage -------------------------- */
const Photos = {
  bdd: null,
  ouvrir() {
    if (this.bdd) return Promise.resolve(this.bdd);
    return new Promise((res, rej) => {
      if (!self.indexedDB) return rej(new Error('IndexedDB indisponible'));
      const r = indexedDB.open('cdes-pret-photos', 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('p')) r.result.createObjectStore('p'); };
      r.onsuccess = () => { this.bdd = r.result; res(this.bdd); };
      r.onerror = () => rej(r.error);
    });
  },
  async lire(cle) {
    try {
      const db = await this.ouvrir();
      return await new Promise((res, rej) => {
        const t = db.transaction('p', 'readonly').objectStore('p').get(cle);
        t.onsuccess = () => res(t.result || []); t.onerror = () => rej(t.error);
      });
    } catch (e) { return []; }
  },
  async ecrire(cle, val) {
    try {
      const db = await this.ouvrir();
      await new Promise((res, rej) => {
        const t = db.transaction('p', 'readwrite').objectStore('p').put(val, cle);
        t.onsuccess = () => res(); t.onerror = () => rej(t.error);
      });
      return true;
    } catch (e) { toast('Les photos n’ont pas pu être enregistrées sur cet appareil.', 'e'); return false; }
  },
  async supprimer(id) {
    try {
      const db = await this.ouvrir();
      ['remise', 'justif'].forEach((p) =>
        db.transaction('p', 'readwrite').objectStore('p').delete(id + ':' + p));
    } catch (e) { /* sans consequence */ }
  },
};

/* ===========================================================================
   Etat vivant de l'appli
   =========================================================================== */
const App = {
  dossiers: {}, pierres: {}, courant: null, filtre: '',
  conf: {}, minuteur: null, synchro: 'inconnu', etape: 'preparer',
  vivants: [],   // zones recalculees apres chaque saisie, sans re-rendre la page
};

/** Zone dont le contenu se recalcule apres chaque saisie (alertes, contrôles).
 *  Evite de re-rendre l'etape entiere, ce qui volerait le focus du champ. */
function zoneVivante(construire) {
  const z = h('div', {});
  const peindre = () => {
    if (!z.isConnected && App.vivants.indexOf(peindre) > -1) return;
    vider(z);
    (construire() || []).forEach((n) => n && z.appendChild(n));
  };
  peindre();
  App.vivants.push(peindre);
  return z;
}

function sauver(immediat) {
  if (!App.courant) return;
  App.courant.maj = Date.now();
  clearTimeout(App.minuteur);
  const faire = async () => {
    const D = App.courant;
    if (!D) return;
    // les photos partent en IndexedDB, le reste en localStorage
    await Photos.ecrire(D.id + ':remise', D.etat.remise.photos || []);
    await Photos.ecrire(D.id + ':justif', D.conducteur.photos || []);
    const copie = JSON.parse(JSON.stringify(D));
    copie.etat.remise.photos = []; copie.conducteur.photos = [];
    copie.nbPhotos = (D.etat.remise.photos || []).length + (D.conducteur.photos || []).length;
    App.dossiers[D.id] = copie;
    Store.ecrire({ dossiers: App.dossiers, pierres: App.pierres });
    dessinerListe();
    majEtapes();
    App.vivants.forEach((f) => { try { f(); } catch (e) { /* sans consequence */ } });
    if (App.conf.autoSync !== false) planifierSync();
  };
  if (immediat) return faire();
  App.minuteur = setTimeout(faire, 500);
}

function refSuivante() {
  const an = new Date().getFullYear();
  let max = 0;
  Object.values(App.dossiers).forEach((d) => {
    const m = /^PRET-(\d{4})-(\d+)$/.exec(d.ref || '');
    if (m && +m[1] === an) max = Math.max(max, +m[2]);
  });
  return 'PRET-' + an + '-' + String(max + 1).padStart(3, '0');
}

/* ===========================================================================
   Champs de formulaire
   ========================================================================== */
function lit(obj, chemin) {
  return chemin.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function ecrit(obj, chemin, v) {
  const ks = chemin.split('.');
  const dernier = ks.pop();
  const cible = ks.reduce((o, k) => (o[k] = o[k] || {}), obj);
  cible[dernier] = v;
}

/** Champ lie a une propriete du dossier courant. */
function champ(o) {
  const val = o.chemin ? lit(App.courant, o.chemin) : o.valeur;
  let ctrl;
  const commun = { placeholder: o.ph || '', id: o.id };
  if (o.type === 'select') {
    ctrl = h('select', commun, (o.options || []).map((op) => {
      const [v, l] = Array.isArray(op) ? op : [op, op];
      return h('option', { value: v, texte: l, selected: String(val || '') === String(v) });
    }));
  } else if (o.type === 'textarea') {
    ctrl = h('textarea', Object.assign({ value: val == null ? '' : val, rows: o.rows || 3 }, commun));
  } else {
    ctrl = h('input', Object.assign({ type: o.type || 'text', value: val == null ? '' : val,
      inputMode: o.inputMode, list: o.liste }, commun));
    if (o.liste) ctrl.setAttribute('list', o.liste);
  }
  const majV = () => {
    const v = ctrl.value;
    if (o.chemin) ecrit(App.courant, o.chemin, v);
    if (o.on) o.on(v);
    sauver();
  };
  ctrl.addEventListener('input', majV);
  ctrl.addEventListener('change', majV);
  return h('label', { class: 'ch' + (o.plein ? ' plein' : '') }, [
    h('span', {}, [o.l, o.req ? h('em', { texte: 'obligatoire' }) : null]),
    ctrl,
    o.aide ? h('div', { class: 'aide', texte: o.aide }) : null,
    o.suggestions ? h('div', { class: 'chips' }, o.suggestions.map((s) =>
      h('button', { class: 'chip', type: 'button', texte: s, onclick: () => {
        ctrl.value = s; majV();
      } }))) : null,
  ]);
}

function caseAcocher(libelle, lu, ecrire) {
  const inp = h('input', { type: 'checkbox', checked: !!lu() });
  const l = h('label', { class: 'case' + (lu() ? ' on' : '') }, [inp, libelle]);
  inp.addEventListener('change', () => {
    ecrire(inp.checked);
    l.classList.toggle('on', inp.checked);
    sauver();
  });
  return l;
}

function carteUI(titre, icone, contenu, note) {
  return h('section', { class: 'carte' }, [
    h('h3', {}, [h('span', { class: 'pastille', texte: icone }), titre,
      note ? h('small', { texte: note }) : null]),
    h('div', { class: 'in' }, contenu),
  ]);
}

function bandeau(type, titre, texte) {
  return h('div', { class: 'info ' + type }, [
    h('span', { class: 'ic', texte: type === 'e' ? '!' : type === 'a' ? '!' : type === 'v' ? '✓' : 'i' }),
    h('div', {}, [h('b', { texte: titre }), h('div', { texte: texte })]),
  ]);
}

/* ===========================================================================
   Etapes
   =========================================================================== */
const ETAPES = [
  { k: 'preparer', t: 'Préparer', s: 'au bureau' },
  { k: 'remettre', t: 'Remettre', s: 'sur le chantier' },
  { k: 'recuperer', t: 'Récupérer', s: 'au retour' },
];

/* --- où en est le prêt : c'est ça que l'écran doit dire en premier ------- */
const JALONS = [
  { k: 'prepare', t: 'Préparé' },
  { k: 'signee', t: 'Convention signée' },
  { k: 'remis', t: 'Matériel remis' },
  { k: 'restitue', t: 'Restitué' },
];

function avancement(D) {
  const sg = D.signatures;
  const prepare = !!(D.chantier.nom && D.emprunteur.raison && (D.materiel[0] || {}).designation &&
    D.conducteur.nom && sg.cdes.traits);
  const signee = !!(sg.emprunteur.traits && sg.emprunteur.traits.length);
  const envoyee = !!sg.emprunteur.envoyeeLe;
  const remis = !!(sg.conducteur.traits && sg.conducteur.traits.length);
  const restitue = !!D.etat.retour.date;
  let suite;
  if (!prepare) suite = 'Compléter la préparation : chantier, engin, conducteur, puis signer pour CDES.';
  else if (!signee && envoyee) suite = 'Convention envoyée le ' + dfr(sg.emprunteur.envoyeeLe) +
    ' — en attente de la signature de l’emprunteur. Elle arrivera toute seule dans le prêt.';
  else if (!signee) suite = 'Faire signer l’emprunteur, ou lui envoyer le lien de signature.';
  else if (!remis) suite = 'Sur le chantier : état des lieux devant l’engin, puis signature du conducteur.';
  else if (!restitue) suite = 'Matériel remis le ' + dfr(D.etat.remise.date) + '. Reste la restitution.';
  else suite = 'Prêt terminé, restitué le ' + dfr(D.etat.retour.date) + '.';
  return { prepare, signee, envoyee, remis, restitue, suite,
    faits: { prepare, signee, remis, restitue } };
}

function bandeauAvancement() {
  const D = App.courant;
  const a = avancement(D);
  const strip = h('div', { class: 'jalons' }, JALONS.map((j, i) => {
    const fait = a.faits[j.k];
    const attente = j.k === 'signee' && !fait && a.envoyee;
    return h('div', { class: 'jalon' + (fait ? ' ok' : attente ? ' attente' : '') }, [
      h('span', { class: 'pt', texte: fait ? '✓' : attente ? '…' : String(i + 1) }),
      h('span', { texte: j.t }),
    ]);
  }));
  return h('div', { class: 'avancement' }, [
    strip,
    h('div', { class: 'suite', texte: a.suite }),
  ]);
}

/** Y a-t-il une autorisation de conduite valide et justifiée ? */
function autorisationOK(D) {
  const a = (D.conducteur.habilitations || []).filter((x) => x.type === AUTORISATION);
  if (!a.length || D.conducteur.aTransmettre) return false;
  return a.some((x) => !x.validite || new Date(x.validite) >= new Date(auj()));
}

/** L'employeur du conducteur est toujours l'entreprise emprunteuse. */
function employeurDe(D) { return D.emprunteur.raison || ''; }

function etapeFaite(k) {
  const D = App.courant; if (!D) return false;
  const a = avancement(D);
  if (k === 'preparer') return a.prepare && a.signee;
  if (k === 'remettre') return a.remis;
  if (k === 'recuperer') return a.restitue;
  return false;
}

/* --- 1. chantier & emprunteur -------------------------------------------- */


async function chercherEntreprise() {
  const nom = ($('#chRaison') || {}).value || App.courant.emprunteur.raison;
  if (!nom || nom.trim().length < 3) return toast("Saisis d'abord un nom d'entreprise.", 'e');
  toast('Recherche dans le registre…');
  try {
    const r = await fetch('https://recherche-entreprises.api.gouv.fr/search?q=' +
      encodeURIComponent(nom) + '&per_page=8');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const res = (j.results || []);
    if (!res.length) return toast('Aucune entreprise trouvée.', 'e');
    const corps = h('div', {}, res.map((e) => {
      const s = e.siege || {};
      return h('button', { class: 'entree', type: 'button', onclick: () => {
        App.courant.emprunteur.raison = e.nom_raison_sociale || e.nom_complet || nom;
        App.courant.emprunteur.siret = s.siret || '';
        App.courant.emprunteur.adresse = (s.adresse || '').replace(/\s+/g, ' ').trim();
        fermerModale(); sauver(true); rendre();
      } }, [
        h('b', { texte: e.nom_raison_sociale || e.nom_complet || '—' }),
        h('span', { texte: [s.siret, (s.adresse || '').replace(/\s+/g, ' ').trim()].filter(Boolean).join(' — ') }),
      ]);
    }));
    modale('Résultats du registre des entreprises', corps);
  } catch (e) {
    toast('Registre injoignable : ' + e.message + '. Saisis les informations à la main.', 'e');
  }
}

/* --- 2. materiel ---------------------------------------------------------- */


/* --- 3. conducteur -------------------------------------------------------- */


/** Photo d'un justificatif, rattachee a une ligne d'habilitation. */
function photoJustif(cle, libelle) {
  const zone = h('div', { class: 'justif' });
  const redessiner = () => {
    const D = App.courant;
    vider(zone);
    const p = (D.conducteur.photos || []).find((x) => x.cle === cle);
    if (p) {
      zone.appendChild(h('div', { class: 'vignette' }, [
        h('img', { src: 'data:image/jpeg;base64,' + p.b64, alt: libelle }),
        h('button', { class: 'x', type: 'button', texte: '✕', title: 'Retirer la photo',
          onclick: () => {
            D.conducteur.photos = D.conducteur.photos.filter((x) => x !== p);
            sauver(true); redessiner();
          } }),
      ]));
      zone.appendChild(h('span', { class: 'aide', texte: 'Photo jointe' }));
      return;
    }
    const inp = h('input', { type: 'file', accept: 'image/*', style: 'display:none' });
    inp.addEventListener('change', async () => {
      const f = (inp.files || [])[0];
      inp.value = '';
      if (!f) return;
      try {
        const ph = await reduirePhoto(f);
        ph.cle = cle; ph.legende = libelle;
        App.courant.conducteur.photos.push(ph);
        await sauver(true); redessiner();
      } catch (e) { toast('Photo illisible.', 'e'); }
    });
    zone.appendChild(h('button', { class: 'b pt', type: 'button', texte: '📷 Photo du document',
      onclick: () => inp.click() }));
    zone.appendChild(inp);
  };
  redessiner();
  return zone;
}

/** Photo d'un justificatif, rattachee a une ligne d'habilitation. */
function photoJustif(cle, libelle) {
  const zone = h('div', { class: 'justif' });
  const redessiner = () => {
    const D = App.courant;
    vider(zone);
    const p = (D.conducteur.photos || []).find((x) => x.cle === cle);
    if (p) {
      zone.appendChild(h('div', { class: 'vignette' }, [
        h('img', { src: 'data:image/jpeg;base64,' + p.b64, alt: libelle }),
        h('button', { class: 'x', type: 'button', texte: '✕', title: 'Retirer la photo',
          onclick: () => {
            D.conducteur.photos = D.conducteur.photos.filter((x) => x !== p);
            sauver(true); redessiner();
          } }),
      ]));
      zone.appendChild(h('span', { class: 'aide', texte: 'Photo jointe' }));
      return;
    }
    const inp = h('input', { type: 'file', accept: 'image/*', style: 'display:none' });
    inp.addEventListener('change', async () => {
      const f = (inp.files || [])[0];
      inp.value = '';
      if (!f) return;
      try {
        const ph = await reduirePhoto(f);
        ph.cle = cle; ph.legende = libelle;
        App.courant.conducteur.photos.push(ph);
        await sauver(true); redessiner();
      } catch (e) { toast('Photo illisible.', 'e'); }
    });
    zone.appendChild(h('button', { class: 'b pt', type: 'button', texte: '📷 Photo du document',
      onclick: () => inp.click() }));
    zone.appendChild(inp);
  };
  redessiner();
  return zone;
}

/* --- 4. etat des lieux ---------------------------------------------------- */
/* =====================================================================
   1 · PRÉPARER — au bureau
   ===================================================================== */
function etapePreparer() {
  const D = App.courant, cd = D.conducteur, m = D.materiel[0];
  const sg = D.signatures;
  const ag = AGENCES.find((a) => a.code === D.agence) || AGENCES[0];
  const types = [AUTORISATION, MEDICALE].concat(CACES.map((x) => x.r));
  const dl = h('datalist', { id: 'lstEngins' }, ENGINS.map((e) => h('option', { value: e.d })));

  const ligneTitre = (hb, i) => {
    const estCaces = hb.type !== AUTORISATION && hb.type !== MEDICALE;
    const cats = estCaces ? (CACES.find((x) => x.r === hb.type) || CACES[0]).cats : [];
    return h('div', { class: 'habil' }, [
      h('div', { class: estCaces ? 'grille g3' : 'grille g2' }, [
        champ({ l: 'Titre', type: 'select', chemin: 'conducteur.habilitations.' + i + '.type',
          options: types, on: () => rendre() }),
        estCaces ? champ({ l: 'Catégorie', type: 'select',
          chemin: 'conducteur.habilitations.' + i + '.cat',
          options: cats.map((t) => [t[0], t[0] + ' — ' + t[1]]) }) : null,
        champ({ l: 'Valable jusqu’au', type: 'date',
          chemin: 'conducteur.habilitations.' + i + '.validite' }),
      ]),
      h('div', { class: 'habilPied' }, [
        caseAcocher('Justificatif vu et vérifié', () => hb.vu, (v) => { hb.vu = v; }),
        photoJustif(hb.id, estCaces ? hb.type + ' ' + (hb.cat || '') : hb.type),
        h('span', { class: 'esp' }),
        h('button', { class: 'b d pt', type: 'button', texte: '✕ Retirer', onclick: () => {
          cd.photos = (cd.photos || []).filter((x) => x.cle !== hb.id);
          cd.habilitations.splice(i, 1); sauver(true); rendre();
        } }),
      ]),
    ]);
  };
  const ajouter = (type, cat) => {
    cd.habilitations.push({ id: uid(), type, cat: cat || '', validite: '', vu: false });
    sauver(true); rendre();
  };

  return [
    carteUI('Le chantier et l’emprunteur', '1', [
      h('div', { class: 'grille g2' }, [
        champ({ l: 'Intitulé du chantier', chemin: 'chantier.nom', req: true, ph: 'Curage du bief de…' }),
        champ({ l: 'Lieu précis', chemin: 'chantier.lieu', req: true, ph: 'Écluse de …, 77000 …' }),
      ]),
      h('div', { class: 'lignesup', style: 'margin-top:13px' }, [
        champ({ l: 'Entreprise emprunteuse', chemin: 'emprunteur.raison', req: true, plein: true, id: 'chRaison' }),
        h('button', { class: 'b', type: 'button', texte: '🔍 Registre', onclick: chercherEntreprise }),
      ]),
      h('div', { class: 'grille g2', style: 'margin-top:13px' }, [
        champ({ l: 'SIRET', chemin: 'emprunteur.siret' }),
        champ({ l: 'Adresse', chemin: 'emprunteur.adresse' }),
        champ({ l: 'Représentée par', chemin: 'emprunteur.representant', ph: 'M. …' }),
        champ({ l: 'Courriel', chemin: 'emprunteur.mail', type: 'email',
          aide: 'Sert à envoyer la convention et le lien de signature.' }),
      ]),
      h('div', { class: 'grille g3', style: 'margin-top:13px' }, [
        champ({ l: 'Début du prêt', chemin: 'convention.du', type: 'date', req: true }),
        champ({ l: 'Fin du prêt', chemin: 'convention.au', type: 'date', req: true }),
        champ({ l: 'Agence CDES', type: 'select', chemin: 'agence',
          options: AGENCES.map((a) => [a.code, a.nom]), on: () => rendre() }),
      ]),
      champ({ l: 'Objet du prêt (phrase reprise à l’article 1)', chemin: 'convention.objet',
        type: 'textarea', plein: true, req: true,
        ph: "utilisation ponctuelle d'une pelle hydraulique sur chenilles sur le chantier de…" }),
      h('div', { class: 'aide', texte: 'Agence : ' + ag.adresse + ' — ' + ag.tel }),
    ]),

    carteUI("L'engin prêté", '2', [
      dl,
      champ({ l: 'Désignation', chemin: 'materiel.0.designation', req: true, plein: true,
        liste: 'lstEngins', id: 'chEngin',
        aide: 'Choisis dans la liste ou écris librement le matériel prêté.',
        on: (v) => {
          const e = ENGINS.find((x) => x.d === v);
          if (e && !m.caces) { m.caces = e.caces; const c = $('#chCaces'); if (c) c.value = e.caces; }
        } }),
      h('div', { class: 'chips', style: 'margin-top:9px' }, ENGINS.map((e) =>
        h('button', { class: 'chip', type: 'button', texte: e.d, onclick: () => {
          m.designation = e.d; m.caces = e.caces; sauver(true); rendre();
        } }))),
      h('div', { class: 'grille g3', style: 'margin-top:15px' }, [
        champ({ l: 'Marque', chemin: 'materiel.0.marque' }),
        champ({ l: 'Modèle', chemin: 'materiel.0.modele' }),
        champ({ l: 'Année', chemin: 'materiel.0.annee', inputMode: 'numeric' }),
        champ({ l: 'N° de parc', chemin: 'materiel.0.parc' }),
        champ({ l: 'N° de série', chemin: 'materiel.0.serie' }),
        champ({ l: 'CACES requis', chemin: 'materiel.0.caces', ph: 'R.482 B1', id: 'chCaces' }),
      ]),
      champ({ l: 'Équipements et accessoires associés', chemin: 'materiel.0.accessoires',
        plein: true, ph: 'Grappin, godet 900 mm, attache rapide…' }),
    ]),

    carteUI("Le conducteur de l'engin", '3', [
      h('div', { class: 'grille g3' }, [
        champ({ l: 'Nom', chemin: 'conducteur.nom', req: true }),
        champ({ l: 'Prénom', chemin: 'conducteur.prenom', req: true }),
        champ({ l: 'Téléphone du conducteur', chemin: 'conducteur.tel', type: 'tel' }),
      ]),
      h('div', { class: 'grille g2', style: 'margin-top:13px' }, [
        champ({ l: 'Né le', chemin: 'conducteur.ne', type: 'date' }),
        h('label', { class: 'ch' }, [
          h('span', { texte: 'Employeur' }),
          h('input', { value: employeurDe(D) || '—', readOnly: true,
            style: 'background:var(--fond);color:var(--doux)' }),
          h('div', { class: 'aide', texte: 'Repris de l’entreprise emprunteuse.' }),
        ]),
      ]),
      h('div', { style: 'margin-top:17px' }, [
        h('div', { class: 'aide', style: 'margin-bottom:9px',
          texte: 'Ses titres : autorisation de conduite, attestation médicale, CACES.' }),
        h('div', {}, cd.habilitations.map(ligneTitre)),
        h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, [
          h('button', { class: 'b', type: 'button', texte: '+ Autorisation de conduite',
            onclick: () => ajouter(AUTORISATION) }),
          h('button', { class: 'b', type: 'button', texte: '+ Attestation médicale',
            onclick: () => ajouter(MEDICALE) }),
          h('button', { class: 'b', type: 'button', texte: '+ CACES',
            onclick: () => ajouter('R.482', 'B1') }),
        ]),
        h('div', { class: 'cases', style: 'margin-top:14px' }, [
          caseAcocher('Le conducteur n’a pas ses papiers — à transmettre ultérieurement',
            () => cd.aTransmettre, (v) => { cd.aTransmettre = v; rendre(); }),
        ]),
        cd.aTransmettre ? h('div', { class: 'grille g2', style: 'margin-top:12px' }, [
          champ({ l: 'Transmission attendue pour le', chemin: 'conducteur.delaiTransmission', type: 'date' }),
        ]) : null,
        zoneVivante(() => alertesConducteur(D)),
      ]),
    ]),

    carteUI('Signature CDES', '4', [
      h('div', { class: 'grille g2' }, [
        champ({ l: 'Nom', chemin: 'signatures.cdes.nom' }),
        champ({ l: 'Prénom', chemin: 'signatures.cdes.prenom' }),
      ]),
      h('div', { style: 'margin-top:13px' }, blocSignature('Signature CDES', sg.cdes)),
      h('div', { class: 'aide', style: 'margin-top:7px',
        texte: 'Une seule signature CDES : elle vaut pour la convention et pour la remise.' }),
    ]),

    carteUI("Signature de l'emprunteur", '5', [
      champ({ l: 'Nom et prénom du signataire', chemin: 'signatures.emprunteur.nom',
        ph: D.emprunteur.representant || '', plein: true }),
      zoneVivante(() => {
        const e = D.signatures.emprunteur;
        if (e.traits && e.traits.length) {
          return [bandeau('v', 'Convention signée',
            'Signée par ' + (e.nom || 'l’emprunteur') +
            (e.signeeLe ? ' le ' + dfr(e.signeeLe) : '') + '.')];
        }
        if (e.envoyeeLe) {
          return [bandeau('a', 'En attente de signature',
            'Lien envoyé le ' + dfr(e.envoyeeLe) + (e.mail ? ' à ' + e.mail : '') +
            '. Dès qu’il signe, la signature revient ici toute seule — il suffit d’ouvrir le prêt.')];
        }
        return [];
      }),
      h('div', { style: 'margin-top:13px' },
        (sg.emprunteur.traits && sg.emprunteur.traits.length) || sg.emprunteur.envoyeeLe
          ? blocSignature("Signature de l'emprunteur", sg.emprunteur)
          : blocSignature("Il signe ici s'il est présent", sg.emprunteur)),
      h('div', { class: 'aide', style: 'margin:9px 0 13px',
        texte: 'S’il n’est pas là, envoie-lui le lien : il signe sur son téléphone et la signature ' +
          'revient dans ce prêt.' }),
      h('button', { class: 'b p', type: 'button', texte: '✉️ Envoyer le lien de signature',
        onclick: () => modaleEnvoi('signature') }),
    ]),

    carteUI('Document', '6', boutonsDocument()),
  ];
}

function alertesConducteur(D) {
  const cd = D.conducteur, out = [];
  const perimees = cd.habilitations.filter((x) => x.validite && new Date(x.validite) < new Date(auj()));
  if (cd.aTransmettre) {
    out.push(bandeau('e', 'Justificatifs non fournis — pas de conduite sans autorisation',
      'La conduite ne peut pas lui être confiée tant que les titres n’ont pas été transmis' +
      (cd.delaiTransmission ? ' (attendus pour le ' + dfr(cd.delaiTransmission) + ')' : '') + '.'));
  }
  if (perimees.length) {
    out.push(bandeau('e', 'Titre périmé', perimees.map((x) =>
      x.type + (x.cat ? ' ' + x.cat : '') + ' — échu le ' + dfr(x.validite)).join(' · ')));
  }
  if (!cd.habilitations.some((x) => x.type === AUTORISATION) && !cd.aTransmettre) {
    out.push(bandeau('a', 'Autorisation de conduite manquante',
      "Sans autorisation de conduite délivrée par son employeur, le conducteur ne peut pas utiliser l'engin."));
  }
  const requis = (D.materiel[0] || {}).caces || '';
  const couvert = !requis || requis === '—' || cd.aTransmettre ||
    cd.habilitations.some((x) => requis.indexOf(x.type) === 0 && (!x.cat || requis.indexOf(x.cat) > -1));
  if (!couvert && cd.habilitations.length) {
    out.push(bandeau('a', 'Catégorie non couverte',
      'L’engin demande un ' + requis + ' et aucun titre saisi ne correspond.'));
  }
  return out;
}

function boutonsDocument() {
  return [
    h('div', { style: 'display:flex;gap:9px;flex-wrap:wrap' }, [
      h('button', { class: 'b n', type: 'button', texte: '📄 Télécharger le PDF',
        onclick: () => telecharger() }),
      h('button', { class: 'b', type: 'button', texte: '👁 Aperçu', onclick: () => apercu() }),
      h('button', { class: 'b', type: 'button', texte: '✉️ Envoyer par mail',
        onclick: () => modaleEnvoi() }),
    ]),
    h('div', { class: 'aide', style: 'margin-top:11px',
      texte: 'Un seul document : la convention, puis la fiche de prêt, et les trois signatures en dernière page.' }),
  ];
}

/* =====================================================================
   2 · REMETTRE — sur le chantier
   ===================================================================== */
function etapeRemettre() {
  const D = App.courant;
  const E = D.etat.remise;
  const m = D.materiel[0] || {};
  const nomCond = ((D.conducteur.prenom || '') + ' ' + (D.conducteur.nom || '')).trim();

  const lignes = [];
  let groupe = '';
  CONTROLES.forEach((c, i) => {
    if (c.g !== groupe) {
      groupe = c.g;
      lignes.push(h('tr', { class: 'grp' }, h('td', { colSpan: 3, texte: groupe })));
    }
    const p = E.points[i] || (E.points[i] = { etat: '', obs: '' });
    const tr = h('tr', { class: p.etat === 'Anomalie' ? 'ano' : '' });
    const sel = h('select', {}, [h('option', { value: '', texte: '—' })].concat(
      ETATS.map((e) => h('option', { value: e, texte: e, selected: p.etat === e }))));
    sel.addEventListener('change', () => {
      p.etat = sel.value; tr.className = p.etat === 'Anomalie' ? 'ano' : ''; sauver();
    });
    const obs = h('input', { value: p.obs || '', placeholder: '…' });
    obs.addEventListener('input', () => { p.obs = obs.value; sauver(); });
    tr.appendChild(h('td', { texte: c.l }));
    tr.appendChild(h('td', {}, sel));
    tr.appendChild(h('td', {}, obs));
    lignes.push(tr);
  });
  const tout = (v) => { CONTROLES.forEach((c, i) => { E.points[i] = E.points[i] || {}; E.points[i].etat = v; });
    sauver(true); rendre(); };

  return [
    bandeau('i', 'Devant la machine',
      ou(m.designation, "l'engin") + (m.parc ? ' (n° de parc ' + m.parc + ')' : '') +
      ' remis à ' + (nomCond || 'le conducteur') + '. Fais le tour, coche, photographie, ' +
      'et fais signer le conducteur en bas de cette page.'),

    carteUI('État des lieux contradictoire', '1', [
      h('div', { style: 'margin-bottom:11px;display:flex;gap:8px;flex-wrap:wrap' }, [
        h('button', { class: 'b pt', type: 'button', texte: '✓ Tout conforme', onclick: () => tout('Conforme') }),
        h('button', { class: 'b pt', type: 'button', texte: 'Tout remettre à zéro', onclick: () => tout('') }),
      ]),
      h('div', { class: 'tblwrap' }, h('table', { class: 'edl' }, [
        h('thead', {}, h('tr', {}, [h('th', { texte: 'Point contrôlé' }), h('th', { texte: 'Constat' }),
          h('th', { texte: 'Observation' })])),
        h('tbody', {}, lignes),
      ])),
      champ({ l: 'Observations générales', chemin: 'etat.remise.obs', type: 'textarea', plein: true }),
    ]),

    carteUI('Photos', '2', [
      h('div', { class: 'aide', style: 'margin-bottom:11px',
        texte: 'Elles restent sur cet appareil et partent dans le PDF, en annexe.' }),
      zonePhotos(E),
    ]),

    carteUI('Signature du conducteur', '3', [
      h('div', { class: 'grille g2' }, [
        champ({ l: 'Date de remise', chemin: 'etat.remise.date', type: 'date' }),
      ]),
      h('div', { style: 'margin-top:13px' },
        blocSignature('Le conducteur — ' + (nomCond || '…'), D.signatures.conducteur)),
    ]),

    carteUI('Document', '4', boutonsDocument()),
  ];
}

/* =====================================================================
   3 · RÉCUPÉRER — au retour
   ===================================================================== */
function etapeRecuperer() {
  const D = App.courant, R = D.etat.retour;
  if (!R.date) {
    return [
      bandeau('i', 'Prêt en cours',
        'À remplir le jour où le matériel revient. Deux clics : la date, et la case qui dit si ' +
        'l’engin revient dans l’état où il est parti.'),
      h('button', { class: 'b p', type: 'button', texte: 'Le matériel est revenu',
        onclick: () => { R.date = auj(); R.identique = true; sauver(true); rendre(); } }),
    ];
  }
  return [
    carteUI('Restitution', '1', [
      h('div', { class: 'grille g2' }, [
        champ({ l: 'Date de restitution', chemin: 'etat.retour.date', type: 'date' }),
      ]),
      h('div', { class: 'cases', style: 'margin-top:15px' }, [
        caseAcocher('Équipement restitué identique à l’état initial',
          () => R.identique, (v) => { R.identique = v; rendre(); }),
      ]),
      R.identique ? null : champ({ l: 'Ce qui a changé', chemin: 'etat.retour.commentaire',
        type: 'textarea', plein: true, ph: 'Rétroviseur droit cassé, plein non fait…' }),
      h('div', { style: 'display:flex;gap:9px;flex-wrap:wrap;margin-top:15px' }, [
        h('button', { class: 'b n', type: 'button', texte: '📄 Télécharger le PDF',
          onclick: () => telecharger() }),
        h('button', { class: 'b', type: 'button', texte: '✉️ Envoyer', onclick: () => modaleEnvoi('bilan') }),
        h('button', { class: 'b', type: 'button', texte: D.statut === 'clos' ? '↩︎ Rouvrir' : '✓ Clôturer',
          onclick: () => { D.statut = D.statut === 'clos' ? 'brouillon' : 'clos'; sauver(true); rendre(); } }),
      ]),
    ]),
  ];
}

function zonePhotos(E) {
  const zone = h('div', { class: 'photos' });
  const redessiner = () => {
    vider(zone);
    (E.photos || []).forEach((p, i) => {
      const leg = h('input', { value: p.legende || '', placeholder: 'Légende…' });
      leg.addEventListener('input', () => { p.legende = leg.value; sauver(); });
      zone.appendChild(h('div', { class: 'photo' }, [
        h('img', { src: 'data:image/jpeg;base64,' + p.b64, alt: p.legende || 'photo' }),
        h('button', { class: 'x', type: 'button', texte: '✕', title: 'Supprimer',
          onclick: () => { E.photos.splice(i, 1); sauver(true); redessiner(); } }),
        leg,
      ]));
    });
    const inp = h('input', { type: 'file', accept: 'image/*', multiple: true, style: 'display:none' });
    inp.addEventListener('change', async () => {
      for (const f of Array.from(inp.files || [])) {
        try { E.photos.push(await reduirePhoto(f)); } catch (e) { toast('Photo illisible : ' + f.name, 'e'); }
      }
      inp.value = ''; await sauver(true); redessiner();
    });
    zone.appendChild(h('div', { class: 'ajout', onclick: () => inp.click() },
      [h('div', {}, ['📷', h('div', { texte: 'Ajouter une photo' })]), inp]));
  };
  redessiner();
  return zone;
}

/** Redimensionne et compresse une photo : 1400 px maxi, JPEG qualite 0,72. */
function reduirePhoto(fichier) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(fichier);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1400;
      let w = img.naturalWidth, hh = img.naturalHeight;
      const k = Math.min(1, MAX / Math.max(w, hh));
      w = Math.round(w * k); hh = Math.round(hh * k);
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = hh;
      cv.getContext('2d').drawImage(img, 0, 0, w, hh);
      const uri = cv.toDataURL('image/jpeg', 0.72);
      res({ b64: uri.slice(uri.indexOf(',') + 1), w, h: hh, legende: '' });
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('image illisible')); };
    img.src = url;
  });
}


/* --- 5. signatures & documents -------------------------------------------- */


function controlerCoherence(D) {
  const bloquants = [], alertes = [];
  const cd = D.conducteur, m = D.materiel[0] || {};
  if (!D.chantier.nom) alertes.push('chantier non renseigné');
  if (!D.emprunteur.raison) bloquants.push('emprunteur non renseigné');
  if (!m.designation) bloquants.push('engin non renseigné');
  if (!cd.nom) bloquants.push('conducteur non renseigné');
  if (cd.aTransmettre) bloquants.push('justificatifs non fournis — pas de conduite sans autorisation');
  else if (!cd.habilitations.some((x) => x.type === AUTORISATION))
    bloquants.push('aucune autorisation de conduite renseignée');
  cd.habilitations.forEach((x) => {
    if (x.validite && new Date(x.validite) < new Date(auj()))
      bloquants.push(x.type + (x.cat ? ' ' + x.cat : '') + ' périmé');
  });
  if (!cd.aTransmettre && !cd.habilitations.some((x) => x.type === MEDICALE))
    alertes.push('attestation médicale non renseignée');
  const faits = Object.keys(D.etat.remise.points || {}).filter((k) => D.etat.remise.points[k].etat).length;
  if (faits < CONTROLES.length) alertes.push('état des lieux incomplet (' + faits + '/' + CONTROLES.length + ')');
  return { bloquants, alertes };
}

/* --- pave de signature ----------------------------------------------------- */
function blocSignature(titre, sig) {
  const cv = h('canvas');
  const bloc = h('div', { class: 'sig' }, [
    h('div', { class: 'tete' }, [titre,
      h('button', { class: 'b pt', type: 'button', texte: 'Effacer', onclick: () => {
        sig.traits = []; sauver(); peindre();
      } })]),
    cv,
    h('div', { class: 'pied', texte: 'Signer au doigt ou à la souris — mention « Lu et approuvé » portée automatiquement.' }),
  ]);

  let ctx, ratio = 1, trait = null;
  const dims = () => ({ w: cv.clientWidth || 300, h: cv.clientHeight || 150 });

  function ajuster() {
    if (!cv.isConnected) { window.removeEventListener('resize', ajuster); return; }
    const { w, h: hh } = dims();
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(w * ratio); cv.height = Math.round(hh * ratio);
    ctx = cv.getContext('2d');
    ctx.scale(ratio, ratio);
    sig.a = w / hh;
    peindre();
  }
  function peindre() {
    const { w, h: hh } = dims();
    ctx.clearRect(0, 0, w, hh);
    ctx.strokeStyle = '#12283A'; ctx.lineWidth = 1.8;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    (sig.traits || []).forEach((t) => {
      ctx.beginPath();
      t.forEach((p, i) => { const x = p[0] * w, y = p[1] * hh;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke();
    });
  }
  const pos = (ev) => {
    const r = cv.getBoundingClientRect();
    return [(ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height];
  };
  cv.addEventListener('pointerdown', (ev) => {
    ev.preventDefault(); cv.setPointerCapture(ev.pointerId);
    sig.traits = sig.traits || []; trait = [pos(ev)]; sig.traits.push(trait);
  });
  cv.addEventListener('pointermove', (ev) => {
    if (!trait) return;
    const p = pos(ev), d = trait[trait.length - 1];
    if (Math.abs(p[0] - d[0]) + Math.abs(p[1] - d[1]) < 0.004) return;
    trait.push(p); peindre();
  });
  const fin = () => { if (trait) { trait = null; sauver(); } };
  cv.addEventListener('pointerup', fin);
  cv.addEventListener('pointercancel', fin);
  cv.addEventListener('pointerleave', fin);

  setTimeout(ajuster, 0);
  window.addEventListener('resize', ajuster);
  return bloc;
}

/* --- 7. restitution -------------------------------------------------------- */


/* ===========================================================================
   Documents : telechargement, apercu, envoi
   =========================================================================== */
function nomFichier(base, D) {
  // pas d'accent dans les noms de fichiers : certains navigateurs retombent sur "download"
  const s = (base + '_' + (D.ref || '') + '_' + (D.conducteur.nom || ''))
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_');
  return s.replace(/_+/g, '_').replace(/^_|_$/g, '') + '.pdf';
}

function telecharger() {
  try {
    const D = App.courant;
    const url = URL.createObjectURL(genererDocument(D).blob());
    const a = h('a', { href: url, download: nomFichier('Pret_de_materiel', D) });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (e) { toast('Génération impossible : ' + e.message, 'e'); }
}
function apercu() {
  try {
    const url = URL.createObjectURL(genererDocument(App.courant).blob());
    const f = window.open(url, '_blank');
    if (!f) toast('Le navigateur a bloqué la fenêtre — utilise le téléchargement.', 'e');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) { toast('Aperçu impossible : ' + e.message, 'e'); }
}

/* ===========================================================================
   Modales
   =========================================================================== */
function modale(titre, corps, actions) {
  const dlg = $('#modale');
  vider($('#modaleTitre')).appendChild(document.createTextNode(titre));
  vider($('#modaleCorps')).appendChild(corps);
  const pied = vider($('#modalePied'));
  (actions || [{ l: 'Fermer', c: 'b', f: fermerModale }]).forEach((a) =>
    pied.appendChild(h('button', { class: a.c || 'b', type: 'button', texte: a.l, onclick: a.f })));
  dlg.showModal();
  return dlg;
}
function fermerModale() { const d = $('#modale'); if (d.open) d.close(); }

function modaleEnvoi(mode) {
  const D = App.courant;
  const signature = mode === 'signature', bilan = mode === 'bilan';
  if (!App.conf.webhook) {
    return modale('Envoi par mail',
      h('div', {}, [bandeau('a', 'Serveur non branché',
        'Cet appareil n’est pas branché au serveur CDES : ouvre le lien de branchement reçu par Teams ' +
        '(ou colle-le dans Réglages), ou télécharge le PDF et envoie-le depuis ta messagerie.')]));
  }
  const parDefaut = signature
    ? [D.signatures.emprunteur.mail || D.emprunteur.mail, App.conf.copie]
    : [D.emprunteur.mail, App.conf.copie];
  const dest = h('input', { class: 'recherche', value: parDefaut.filter(Boolean).join(', '),
    placeholder: 'adresse1@… , adresse2@…' });
  const objet = h('input', { class: 'recherche',
    value: (signature ? 'Convention de prêt à signer — ' : bilan ? 'Restitution du matériel — ' :
      'Prêt de matériel — ') + (D.ref || '') + ' — ' + (D.materiel[0].designation || '') });
  const mot = h('textarea', { class: 'recherche', rows: 5, style: 'min-height:110px',
    value: messageParDefaut(D, mode) });
  const corps = h('div', {}, [
    signature ? bandeau('i', 'Lien de signature',
      'Le message contient un lien : l’emprunteur ouvre la page sur son téléphone, signe au doigt, ' +
      'et sa signature revient toute seule dans ce prêt à la prochaine ouverture.') : null,
    h('label', { class: 'ch' }, [h('span', { texte: 'Destinataires' }), dest]),
    h('label', { class: 'ch', style: 'margin-top:12px' }, [h('span', { texte: 'Objet' }), objet]),
    h('label', { class: 'ch', style: 'margin-top:12px' }, [h('span', { texte: 'Message' }), mot]),
    h('div', { class: 'aide', style: 'margin-top:12px',
      texte: 'Le PDF du prêt est joint automatiquement.' }),
  ]);
  modale(signature ? 'Envoyer le lien de signature'
    : bilan ? 'Envoyer le bilan de restitution' : 'Envoyer le dossier de prêt', corps, [
    { l: 'Annuler', c: 'b', f: fermerModale },
    { l: 'Envoyer', c: 'b p', f: () => envoyer(dest.value, objet.value, mot.value, mode) },
  ]);
}

function messageParDefaut(D, mode) {
  const m = D.materiel[0] || {};
  const nom = ((D.conducteur.prenom || '') + ' ' + (D.conducteur.nom || '')).trim();
  const signe = ((D.signatures.cdes.prenom || '') + ' ' + (D.signatures.cdes.nom || '')).trim();
  if (mode === 'bilan') {
    return 'Bonjour,\n\nVous trouverez ci-joint le document de prêt complété de la restitution ' +
      'du ' + dfr(D.etat.retour.date) + ' concernant ' + (m.designation || 'le matériel') + '.\n' +
      (D.etat.retour.identique
        ? 'Le matériel a été restitué dans son état initial.\n'
        : 'Des réserves ont été portées au document.\n') +
      '\nCordialement,\n' + (signe || 'CDES');
  }
  if (mode === 'signature') {
    return 'Bonjour,\n\nVous trouverez ci-joint la convention de mise à disposition de ' +
      (m.designation || 'matériel') + ' pour la période du ' + dfr(D.convention.du) + ' au ' +
      dfr(D.convention.au) + '.\n\nAprès l’avoir lue, vous pouvez la signer directement depuis votre ' +
      'téléphone en suivant le lien ci-dessous :\n\n' + lienSignature(D) +
      '\n\nVotre signature revient automatiquement dans notre dossier, rien d’autre à nous renvoyer.' +
      '\n\nCordialement,\n' + (signe || 'CDES');
  }
  return 'Bonjour,\n\nVous trouverez ci-joint la convention de mise à disposition et la fiche de prêt ' +
    'de matériel établies pour ' + (nom || 'votre conducteur') + ', concernant ' +
    (m.designation || 'le matériel') + ', pour la période du ' + dfr(D.convention.du) +
    ' au ' + dfr(D.convention.au) + '.\n\nCordialement,\n' + (signe || 'CDES');
}

/** Adresse de la page de signature de l'emprunteur. */
function lienSignature(D) {
  if (!D.signatures.emprunteur.jeton) D.signatures.emprunteur.jeton = uid() + uid();
  const base = App.conf.webhook || '';
  return base ? base + '?s=' + D.signatures.emprunteur.jeton : '(lien indisponible : serveur non branché)';
}

async function envoyer(dest, objet, message, mode) {
  const D = App.courant;
  const liste = (dest || '').split(/[;,]/).map((x) => x.trim()).filter(Boolean);
  if (!liste.length) return toast('Indique au moins un destinataire.', 'e');
  fermerModale();
  toast('Envoi en cours…');
  let fichiers;
  try {
    fichiers = [{ nom: nomFichier('Pret_de_materiel', D), b64: genererDocument(D).base64() }];
  } catch (e) { return toast('Génération impossible : ' + e.message, 'e'); }
  try {
    // le jeton doit être connu du serveur AVANT que l'emprunteur ouvre le lien
    if (mode === 'signature') { lienSignature(D); await sauver(true); await synchroniser(true); }
    const r = await poster({ action: 'envoi', ref: D.ref, destinataires: liste,
      objet, message, fichiers, resume: resumeDossier(D) });
    if (r && r.ok) {
      D.envois = (D.envois || []).concat([{ le: Date.now(), a: liste.join(', '), mode: mode || 'dossier' }]);
      if (mode === 'signature') {
        D.signatures.emprunteur.mail = liste[0];
        D.signatures.emprunteur.envoyeeLe = auj();
      }
      sauver(true);
      toast(r.mode === 'file'
        ? 'Envoi programmé pour ' + liste.join(', ') + ' — part de la boîte CDES sous 15 min.'
        : 'Envoyé à ' + liste.join(', '), 'v');
      rendre();
    } else {
      toast('Le serveur a refusé l’envoi : ' + ((r && r.message) || 'réponse inattendue'), 'e');
    }
  } catch (e) {
    toast('Envoi impossible : ' + e.message + '. Le PDF reste téléchargeable.', 'e');
  }
}

function resumeDossier(D) {
  const m = D.materiel[0] || {};
  const a = avancement(D);
  return {
    ref: D.ref, statut: D.statut, agence: D.agence,
    chantier: D.chantier.nom, lieu: D.chantier.lieu,
    emprunteur: D.emprunteur.raison, siret: D.emprunteur.siret,
    conducteur: ((D.conducteur.prenom || '') + ' ' + (D.conducteur.nom || '')).trim(),
    engin: m.designation, parc: m.parc,
    redacteur: ((D.signatures.cdes.prenom || '') + ' ' + (D.signatures.cdes.nom || '')).trim(),
    du: D.convention.du, au: D.convention.au,
    remise: a.remis ? D.etat.remise.date : '', retour: D.etat.retour.date,
    anomalies: Object.values(D.etat.remise.points || {}).filter((p) => p.etat === 'Anomalie').length,
    reserves: D.etat.retour.date && !D.etat.retour.identique ? 'oui' : 'non',
    justifsATransmettre: D.conducteur.aTransmettre ? 'OUI' : '',
    signatureDistance: a.envoyee && !a.signee ? 'OUI' : '',
  };
}

/* ===========================================================================
   Serveur (Apps Script)
   =========================================================================== */
async function poster(charge) {
  const url = App.conf.webhook;
  if (!url) throw new Error('appareil non branché : ouvre le lien de branchement reçu par Teams');
  if (!/\/exec$/.test(url)) throw new Error('l’adresse doit se terminer par /exec');
  charge.secret = App.conf.secret || '';                       // V2 : mot de passe sur chaque appel
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // evite le pre-vol CORS
    body: JSON.stringify(charge),
  });
  const t = await r.text();
  if (/^\s*</.test(t)) throw new Error('le serveur a renvoyé une page web — vérifie « Qui a accès : Tout le monde »');
  let j;
  try { j = JSON.parse(t); } catch (e) { throw new Error('réponse illisible du serveur'); }
  if (j && j.refus) { const e = new Error(j.message || 'accès refusé'); e.refus = true; throw e; }
  return j;
}

/* Lien de branchement : …/#config=<adresse + mot de passe encodés>. Lu UNE fois,
   mémorisé sur l'appareil, puis retiré de la barre d'adresse. */
function appliquerLienBranchement() {
  const m = /[#&]config=([A-Za-z0-9_-]+)/.exec(location.hash || '');
  if (!m) return false;
  try {
    let b = m[1].replace(/-/g, '+').replace(/_/g, '/');
    b += '='.repeat((4 - b.length % 4) % 4);
    const txt = new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0)));
    const c = JSON.parse(txt);
    if (c && /\/exec$/.test(c.u || '')) {
      Store.majConf({ webhook: c.u, secret: c.s || '' });
      history.replaceState(null, '', location.pathname + location.search);
      setTimeout(() => toast('Appareil branché au serveur CDES ✓', 'v'), 400);
      return true;
    }
  } catch (e) { /* lien abîmé */ }
  setTimeout(() => toast('Lien de branchement illisible : redemande-le.', 'e'), 400);
  return false;
}

let syncEnCours = false, syncPrevue = null;
function planifierSync() {
  clearTimeout(syncPrevue);
  syncPrevue = setTimeout(() => synchroniser(true), 2500);
}

async function synchroniser(silencieux) {
  if (!App.conf.webhook) { majEtatSync('local'); return; }
  if (syncEnCours) return;
  syncEnCours = true; majEtatSync('cours');
  try {
    const r = await poster({ action: 'sync', dossiers: Object.values(App.dossiers), pierres: App.pierres });
    if (!r || !r.ok) throw new Error((r && r.message) || 'réponse inattendue');
    let recus = 0;
    (r.dossiers || []).forEach((d) => {
      if (!d || !d.id) return;
      if (App.pierres[d.id] && App.pierres[d.id] > (d.maj || 0)) return;   // supprimé localement
      const local = App.dossiers[d.id];
      if (!local || (d.maj || 0) > (local.maj || 0)) {
        App.dossiers[d.id] = normaliser(d); recus++;
        if (App.courant && App.courant.id === d.id && !estEnEdition()) chargerDossier(d.id, true);
      }
    });
    if (r.entete && appliquerEntete(r.entete)) Store.majConf({ entete: r.entete });   // V2.1
    Object.assign(App.pierres, r.pierres || {});
    Object.keys(App.pierres).forEach((id) => {
      const d = App.dossiers[id];
      if (d && App.pierres[id] > (d.maj || 0)) delete App.dossiers[id];
    });
    Store.ecrire({ dossiers: App.dossiers, pierres: App.pierres });
    dessinerListe();
    majEtatSync('ok');
    if (!silencieux) toast(recus ? recus + ' dossier(s) reçus du serveur.' : 'Tout est à jour.', 'v');
  } catch (e) {
    majEtatSync(e.refus ? 'refus' : 'ko');
    if (!silencieux || e.refus) toast('Synchronisation impossible : ' + e.message, 'e');
  } finally { syncEnCours = false; }
}

function estEnEdition() {
  const a = document.activeElement;
  return !!(a && /^(INPUT|TEXTAREA|SELECT|CANVAS)$/.test(a.tagName));
}

function majEtatSync(etat) {
  App.synchro = etat;
  const e = $('#etatSync'); if (!e) return;
  const carte = { local: ['', 'Hors ligne — tout reste sur cet appareil'],
    cours: ['wait', 'Synchronisation…'], ok: ['ok', 'Synchronisé'], ko: ['ko', 'Serveur injoignable'],
    refus: ['ko', 'Appareil non branché — lien de branchement requis'] };
  const [c, t] = carte[etat] || ['', '—'];
  e.className = 'pastilleEtat ' + c;
  vider(e).append(h('i', {}), document.createTextNode(t));
}

/* ===========================================================================
   Reglages
   =========================================================================== */
function modaleReglages() {
  const url = h('input', { class: 'recherche', value: App.conf.webhook || '',
    placeholder: 'https://script.google.com/macros/s/…/exec' });
  const copie = h('input', { class: 'recherche', value: App.conf.copie || '',
    placeholder: 'prenom.nom@cdes.eu' });
  const parFichier = typeof CONFIG !== 'undefined' && CONFIG.WEBHOOK_URL;
  const lien = h('input', { class: 'recherche', value: '', placeholder: 'https://outilshse.github.io/…/#config=…' });
  const secret = h('input', { class: 'recherche', type: 'password', value: App.conf.secret || '',
    placeholder: 'fourni par le lien de branchement', autocomplete: 'off' });
  const corps = h('div', {}, [
    App.conf.webhook && App.conf.secret
      ? bandeau('v', 'Appareil branché', 'Cet appareil connaît l’adresse du serveur et son mot de passe. ' +
        'Version de la page : ' + VERSION_PAGE + '.')
      : bandeau('a', 'Appareil non branché', 'Colle ci-dessous le lien de branchement reçu par Teams, ' +
        'ou renseigne l’adresse et le mot de passe à la main.'),
    h('label', { class: 'ch' }, [h('span', { texte: 'Lien de branchement (colle-le ici, puis Enregistrer)' }), lien]),
    h('label', { class: 'ch', style: 'margin-top:12px' }, [h('span', { texte: 'Adresse du script Google (webhook)' }), url]),
    h('label', { class: 'ch', style: 'margin-top:12px' }, [h('span', { texte: 'Mot de passe du serveur' }), secret]),
    h('label', { class: 'ch', style: 'margin-top:12px' },
      [h('span', { texte: 'Mettre systématiquement en copie' }), copie]),
    h('div', { class: 'cases', style: 'margin-top:14px' }, [
      caseAcocher('Synchroniser automatiquement', () => App.conf.autoSync !== false,
        (v) => { Store.majConf({ autoSync: v }); App.conf.autoSync = v; }),
    ]),
    h('div', { class: 'aide', style: 'margin-top:14px' },
      'Les photos ne sont jamais envoyées au serveur : elles restent sur l’appareil et ' +
      'partent uniquement dans le PDF.'),
  ]);
  modale('Réglages', corps, [
    { l: 'Fermer', c: 'b', f: fermerModale },
    { l: 'Enregistrer', c: 'b p', f: () => {
      const l = lien.value.trim();
      if (l && /#config=/.test(l)) {
        // le lien collé prime : on le lit comme s'il avait été ouvert
        const sauve = location.hash;
        history.replaceState(null, '', location.pathname + location.search + l.slice(l.indexOf('#')));
        appliquerLienBranchement();
        if (!location.hash && sauve && !/#config=/.test(sauve)) history.replaceState(null, '', location.pathname + location.search + sauve);
      } else {
        Store.majConf({ webhook: url.value.trim(), secret: secret.value.trim() });
      }
      Store.majConf({ copie: copie.value.trim() });
      App.conf = Object.assign({}, Store.conf());
      if (!App.conf.webhook && parFichier) App.conf.webhook = CONFIG.WEBHOOK_URL;
      fermerModale(); synchroniser();
    } },
  ]);
}

/* ===========================================================================
   Liste et navigation
   =========================================================================== */
function dessinerListe() {
  const zone = $('#liste'); if (!zone) return;
  vider(zone);
  const f = App.filtre.toLowerCase();
  const items = Object.values(App.dossiers)
    .filter((d) => !f || [d.ref, d.chantier.nom, d.emprunteur.raison, d.conducteur.nom,
      (d.materiel[0] || {}).designation].join(' ').toLowerCase().includes(f))
    .sort((a, b) => (b.maj || 0) - (a.maj || 0));
  if (!items.length) {
    zone.appendChild(h('div', { class: 'vide',
      texte: App.filtre ? 'Aucun prêt ne correspond.' : 'Aucun prêt enregistré pour l’instant.' }));
    return;
  }
  items.forEach((d) => {
    const nom = ((d.conducteur.prenom || '') + ' ' + (d.conducteur.nom || '')).trim();
    const etiq = d.statut === 'clos' ? '● clos' : d.etat.retour.date ? '● restitué' : '○ en cours';
    zone.appendChild(h('button', {
      class: 'entree' + (App.courant && App.courant.id === d.id ? ' on' : ''), type: 'button',
      onclick: () => chargerDossier(d.id),
    }, [
      h('b', { texte: (d.ref || 'Sans référence') + ' — ' + (nom || 'conducteur à renseigner') }),
      h('span', { texte: etiq + ' · ' + (d.emprunteur.raison || '—') }),
      h('span', { texte: ((d.materiel[0] || {}).designation || '—') }),
    ]));
  });
}

async function chargerDossier(id, garderEtape) {
  const brut = App.dossiers[id];
  if (!brut) return;
  const D = normaliser(JSON.parse(JSON.stringify(brut)));
  D.etat.remise.photos = await Photos.lire(id + ':remise');
  D.conducteur.photos = await Photos.lire(id + ':justif');
  App.courant = D;
  if (!garderEtape) App.etape = 'preparer';
  dessinerListe(); rendre();
}

function nouveau() {
  const D = nouveauDossier(App.conf.agence);
  D.ref = refSuivante();
  D.convention.ref = D.ref.replace('PRET', 'CONV');
  const ag = AGENCES.find((a) => a.code === D.agence) || AGENCES[0];
  const bouts = String(ag.chef || '').split(' ');
  D.signatures.cdes.nom = bouts.shift() || '';
  D.signatures.cdes.prenom = bouts.join(' ');
  App.courant = D; App.etape = 'preparer';
  sauver(true); rendre();
}

function supprimer() {
  const D = App.courant; if (!D) return;
  modale('Supprimer ce prêt ?', h('div', { texte:
    'Le prêt ' + (D.ref || '') + ' et ses photos seront supprimés sur cet appareil, et la suppression ' +
    'sera propagée au serveur. Cette action est définitive.' }), [
    { l: 'Annuler', c: 'b', f: fermerModale },
    { l: 'Supprimer', c: 'b d', f: async () => {
      fermerModale();
      App.pierres[D.id] = Date.now();
      delete App.dossiers[D.id];
      await Photos.supprimer(D.id);
      Store.ecrire({ dossiers: App.dossiers, pierres: App.pierres });
      App.courant = null; dessinerListe(); rendre();
      if (App.conf.autoSync !== false) synchroniser(true);
    } },
  ]);
}

/* ===========================================================================
   Rendu general
   =========================================================================== */
/** Redessine seulement le fil des étapes (pastilles vertes) — ne vole aucun focus. */
function majEtapes() {
  const zoneE = $('#etapes');
  if (!zoneE || !App.courant) return;
  vider(zoneE);
  ETAPES.forEach((e, i) => {
    zoneE.appendChild(h('button', {
      class: 'etape' + (App.etape === e.k ? ' on' : '') + (etapeFaite(e.k) ? ' ok' : ''), type: 'button',
      onclick: () => { App.etape = e.k; rendre(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
    }, [h('span', { class: 'num', texte: etapeFaite(e.k) ? '✓' : String(i + 1) }),
      h('span', {}, [e.t, h('em', { texte: '  ' + e.s })])]));
  });
}

function rendre() {
  const zoneE = $('#etapes'), zoneC = $('#contenu'), zoneB = $('#barre');
  vider(zoneE); vider(zoneC); vider(zoneB);
  App.vivants = [];
  if (!App.courant) {
    zoneC.appendChild(h('div', { class: 'vide', style: 'padding:60px 20px' }, [
      h('div', { style: 'font-size:34px;margin-bottom:10px', texte: '📋' }),
      h('div', { texte: 'Choisis un prêt dans la liste, ou crée-en un nouveau.' }),
      h('div', { style: 'margin-top:16px' },
        h('button', { class: 'b p', type: 'button', texte: '+ Nouveau prêt', onclick: nouveau })),
    ]));
    return;
  }
  const D = App.courant;
  majEtapes();

  const rendus = { preparer: etapePreparer, remettre: etapeRemettre, recuperer: etapeRecuperer };
  zoneC.appendChild(zoneVivante(() => [bandeauAvancement()]));
  const bloc = (rendus[App.etape] || etapePreparer)();
  (Array.isArray(bloc) ? bloc : [bloc]).forEach((n) => n && zoneC.appendChild(n));

  const idx = ETAPES.findIndex((e) => e.k === App.etape);
  zoneB.appendChild(h('button', { class: 'b', type: 'button', texte: '← Précédent', disabled: idx <= 0,
    onclick: () => { App.etape = ETAPES[idx - 1].k; rendre(); window.scrollTo({ top: 0 }); } }));
  zoneB.appendChild(h('button', { class: 'b p', type: 'button', texte: 'Suivant →',
    disabled: idx >= ETAPES.length - 1,
    onclick: () => { App.etape = ETAPES[idx + 1].k; rendre(); window.scrollTo({ top: 0 }); } }));
  zoneB.appendChild(h('span', { class: 'esp' }));
  zoneB.appendChild(h('span', { class: 'aide', texte: D.ref || '' }));
  zoneB.appendChild(h('button', { class: 'b', type: 'button', texte: '📄 PDF',
    onclick: () => telecharger() }));
  zoneB.appendChild(h('button', { class: 'b d', type: 'button', texte: 'Supprimer', onclick: supprimer }));
}

/* ===========================================================================
   Demarrage
   =========================================================================== */
function demarrer() {
  appliquerLienBranchement();
  App.conf = Store.conf();
  appliquerEntete(App.conf.entete);           // V2.1 : en-tête reçue du serveur lors d'une synchro précédente
  if (!App.conf.webhook && typeof CONFIG !== 'undefined' && CONFIG.WEBHOOK_URL) {
    App.conf.webhook = CONFIG.WEBHOOK_URL;
  }
  const b = Store.lire();
  App.pierres = b.pierres;
  Object.keys(b.dossiers).forEach((id) => { App.dossiers[id] = normaliser(b.dossiers[id]); });

  $('#btnNouveau').addEventListener('click', nouveau);
  $('#btnReglages').addEventListener('click', modaleReglages);
  $('#btnSync').addEventListener('click', () => synchroniser(false));
  $('#recherche').addEventListener('input', (e) => { App.filtre = e.target.value; dessinerListe(); });
  $('#modaleFermer').addEventListener('click', fermerModale);

  dessinerListe(); rendre();
  majEtatSync(App.conf.webhook ? 'ok' : 'local');
  if (App.conf.webhook && App.conf.autoSync !== false) synchroniser(true);
  window.addEventListener('pagehide', () => { try { sauver(true); } catch (e) { /* rien */ } });
  // lien de branchement ouvert alors que la page est déjà affichée (même onglet)
  window.addEventListener('hashchange', () => {
    if (appliquerLienBranchement()) { App.conf = Store.conf(); synchroniser(false); }
  });
}
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('logo').src = LOGO_URI;
  if (await chargerListes() === 'echec') {
    document.getElementById('contenu').textContent =
      'Impossible de charger les listes de l’outil (data/listes.json). Vérifie la connexion, puis recharge la page.';
    return;
  }
  demarrer();
});
