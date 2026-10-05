/* Prêt de matériel CDES — moteur PDF, 100 % navigateur, sans bibliothèque externe
   Découpage du 05/10/2026 (V2.1). Ni donnée personnelle, ni adresse de serveur, ni secret. */
/* ===========================================================================
   Moteur PDF — 100 % navigateur, aucune bibliotheque externe.
   Ecrit un PDF 1.4 : polices Helvetica de base (pas d'incorporation), image
   du logo passee telle quelle en flux zlib + predicteur PNG, signatures
   dessinees en vectoriel. Origine des coordonnees en HAUT A GAUCHE, en points.
   =========================================================================== */
const PT_MM = 72 / 25.4;

/* ---------- encodage WinAnsi -------------------------------------------- */
const WINANSI_MAP = (() => {
  const m = new Map();
  for (let c = 32; c < 127; c++) m.set(String.fromCharCode(c), c);
  for (let i = 0; i < WINANSI_HI.length; i++) {
    const ch = WINANSI_HI[i];
    if (ch !== '\uFFFD' && !m.has(ch)) m.set(ch, 128 + i);
  }
  // equivalents typographiques courants absents de WinAnsi
  [['\u202F', 32], ['\u2009', 32], ['\u2011', 45], ['\u2212', 45],
   ['\u2044', 47], ['\u02BC', 146], ['\u2610', 32], ['\u00A0', 160]]
    .forEach(([ch, c]) => m.set(ch, c));
  return m;
})();

function toWinAnsi(s) {
  let out = '';
  for (const ch of String(s == null ? '' : s)) {
    const c = WINANSI_MAP.get(ch);
    out += String.fromCharCode(c === undefined ? 63 /* ? */ : c);
  }
  return out;
}

/* ---------- mesure de texte --------------------------------------------- */
function largeur(txt, taille, style) {
  const t = HELV_W[style] || HELV_W.n;
  const s = toWinAnsi(txt);
  let w = 0;
  for (let i = 0; i < s.length; i++) w += t[s.charCodeAt(i)] || 0;
  return (w * taille) / 1000;
}

/** Coupe un texte en lignes tenant dans `max`. Respecte les \n. */
function couper(txt, max, taille, style) {
  const lignes = [];
  for (const bloc of String(txt == null ? '' : txt).split('\n')) {
    const mots = bloc.split(/\s+/).filter((m) => m.length);
    if (!mots.length) { lignes.push(''); continue; }
    let cur = '';
    for (let mot of mots) {
      // un mot seul plus large que la colonne : on le coupe caractere par caractere
      while (largeur(mot, taille, style) > max) {
        let n = 1;
        while (n < mot.length && largeur(mot.slice(0, n + 1), taille, style) <= max) n++;
        if (cur) { lignes.push(cur); cur = ''; }
        lignes.push(mot.slice(0, n));
        mot = mot.slice(n);
      }
      const essai = cur ? cur + ' ' + mot : mot;
      if (largeur(essai, taille, style) <= max) cur = essai;
      else { if (cur) lignes.push(cur); cur = mot; }
    }
    if (cur) lignes.push(cur);
  }
  return lignes;
}

/* ---------- utilitaires -------------------------------------------------- */
function esc(s) { return s.replace(/([\\()])/g, '\\$1').replace(/[\r\n]/g, ' '); }
function n2(v) { return (Math.round(v * 100) / 100).toString(); }
function rgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255,
          parseInt(h.slice(4, 6), 16) / 255].map((v) => n2(v)).join(' ');
}

/* ===========================================================================
   Document
   =========================================================================== */
class PdfDoc {
  constructor(opts) {
    opts = opts || {};
    this.W = opts.W || 595.28;              // A4 portrait
    this.H = opts.H || 841.89;
    this.marge = Object.assign({ g: 46, d: 46, h: 88, b: 56 }, opts.marge);
    this.meta = Object.assign({ titre: '', auteur: 'CDES', sujet: '' }, opts.meta);
    this.pages = [];
    this.flux = null;
    this.y = 0;
    this.imgs = [];        // {kind:'png'|'jpeg', w, h, bin}
    this.iLogo = 0;
    this.enTete = opts.enTete || null;      // (doc, numero) => void
    this.piedDePage = opts.piedDePage || null;
  }

  get gauche() { return this.marge.g; }
  get droite() { return this.W - this.marge.d; }
  get large() { return this.W - this.marge.g - this.marge.d; }
  get bas() { return this.H - this.marge.b; }

  /* ---- pages ---- */
  nouvellePage() {
    this.flux = [];
    this.pages.push(this.flux);
    this.y = this.marge.h;
    if (this.enTete) this.enTete(this, this.pages.length);
    return this;
  }
  /** Garantit `h` points disponibles, sinon page suivante. */
  place(h) {
    if (!this.flux) this.nouvellePage();
    else if (this.y + h > this.bas) this.nouvellePage();
    return this;
  }
  op(s) { if (!this.flux) this.nouvellePage(); this.flux.push(s); return this; }

  /* ---- primitives ---- */
  rect(x, y, w, h, o) {
    o = o || {};
    const r = o.r || 0;
    let p;
    if (r > 0) {
      const k = r * 0.5523;
      p = `${n2(x + r)} ${n2(this.H - y)} m ` +
          `${n2(x + w - r)} ${n2(this.H - y)} l ` +
          `${n2(x + w - r + k)} ${n2(this.H - y)} ${n2(x + w)} ${n2(this.H - y - r + k)} ${n2(x + w)} ${n2(this.H - y - r)} c ` +
          `${n2(x + w)} ${n2(this.H - y - h + r)} l ` +
          `${n2(x + w)} ${n2(this.H - y - h + r - k)} ${n2(x + w - r + k)} ${n2(this.H - y - h)} ${n2(x + w - r)} ${n2(this.H - y - h)} c ` +
          `${n2(x + r)} ${n2(this.H - y - h)} l ` +
          `${n2(x + r - k)} ${n2(this.H - y - h)} ${n2(x)} ${n2(this.H - y - h + r - k)} ${n2(x)} ${n2(this.H - y - h + r)} c ` +
          `${n2(x)} ${n2(this.H - y - r)} l ` +
          `${n2(x)} ${n2(this.H - y - r + k)} ${n2(x + r - k)} ${n2(this.H - y)} ${n2(x + r)} ${n2(this.H - y)} c h`;
    } else {
      p = `${n2(x)} ${n2(this.H - y - h)} ${n2(w)} ${n2(h)} re`;
    }
    const parts = ['q'];
    if (o.fill) parts.push(rgb(o.fill) + ' rg');
    if (o.stroke) parts.push(rgb(o.stroke) + ' RG', n2(o.lw || 0.6) + ' w');
    parts.push(p, o.fill && o.stroke ? 'B' : o.fill ? 'f' : 'S', 'Q');
    return this.op(parts.join(' '));
  }

  ligne(x1, y1, x2, y2, o) {
    o = o || {};
    return this.op(`q ${rgb(o.couleur || '#CBD5DD')} RG ${n2(o.lw || 0.6)} w ` +
      (o.pointille ? `[${o.pointille}] 0 d ` : '') +
      `${n2(x1)} ${n2(this.H - y1)} m ${n2(x2)} ${n2(this.H - y2)} l S Q`);
  }

  /** Texte sur une seule ligne, y = ligne de base du haut de la boite. */
  texte(txt, x, y, o) {
    o = o || {};
    const taille = o.taille || 9.5, style = o.style || 'n';
    const s = toWinAnsi(txt);
    if (!s.length) return this;
    let px = x;
    const w = largeur(txt, taille, style);
    if (o.align === 'droite') px = x - w;
    else if (o.align === 'centre') px = x - w / 2;
    const f = { n: '/F1', b: '/F2', i: '/F3' }[style];
    // Tw fait partie de l'etat de texte et SURVIT au ET : on l'ecrit toujours,
    // sinon l'espacement d'une ligne justifiee contamine tout le reste de la page.
    this.op(`BT ${rgb(o.couleur || '#1B2B36')} rg ${f} ${n2(taille)} Tf ` +
      `${n2(o.espMot || 0)} Tw ` +
      `${n2(px)} ${n2(this.H - y - taille * 0.8)} Td (${esc(s)}) Tj ET`);
    if (o.souligne) {
      this.ligne(px, y + taille * 1.02, px + w, y + taille * 1.02,
        { couleur: o.couleur || '#1B2B36', lw: 0.5 });
    }
    return this;
  }

  /** Paragraphe coupe et pousse le curseur. Renvoie la hauteur consommee. */
  para(txt, o) {
    o = o || {};
    const taille = o.taille || 9.5, style = o.style || 'n';
    const inter = o.inter || taille * 1.42;
    const x = o.x === undefined ? this.gauche : o.x;
    const max = o.large || (this.droite - x);
    const lignes = couper(txt, max, taille, style);
    for (let i = 0; i < lignes.length; i++) {
      this.place(inter);
      let espMot = 0;
      const derniere = i === lignes.length - 1 || lignes[i + 1] === '';
      if (o.justifie && !derniere && lignes[i].includes(' ')) {
        const nb = lignes[i].split(' ').length - 1;
        const reste = max - largeur(lignes[i], taille, style);
        if (reste > 0 && reste / nb < taille * 0.28) espMot = reste / nb;
      }
      this.texte(lignes[i], x, this.y, { taille, style, couleur: o.couleur, espMot, align: o.align,
        souligne: o.souligne });
      this.y += inter;
    }
    if (o.apres) this.y += o.apres;
    return this;
  }

  /* ---- images ---- */
  /** Enregistre le logo (PNG deflate + predicteur) et renvoie son numero. */
  logo() {
    if (!this.iLogo) {
      this.imgs.push({ kind: 'png', w: LOGO_CDES.w, h: LOGO_CDES.h, bin: atob(LOGO_CDES.d) });
      this.iLogo = this.imgs.length;
    }
    return this.iLogo;
  }
  /** Enregistre une photo JPEG (base64 sans en-tete data:) et renvoie son numero. */
  jpeg(b64, w, h) {
    this.imgs.push({ kind: 'jpeg', w, h, bin: atob(b64) });
    return this.imgs.length;
  }
  image(num, x, y, w, h) {
    if (!num) return this;
    return this.op(`q ${n2(w)} 0 0 ${n2(h)} ${n2(x)} ${n2(this.H - y - h)} cm /Im${num} Do Q`);
  }

  /* ---- polyligne (signatures) ---- */
  trace(points, o) {
    o = o || {};
    if (points.length < 2) {
      if (points.length === 1) {
        const p = points[0];
        return this.rect(p.x - 0.6, p.y - 0.6, 1.2, 1.2, { fill: o.couleur || '#12283A' });
      }
      return this;
    }
    let p = `${n2(points[0].x)} ${n2(this.H - points[0].y)} m`;
    for (let i = 1; i < points.length; i++) p += ` ${n2(points[i].x)} ${n2(this.H - points[i].y)} l`;
    return this.op(`q ${rgb(o.couleur || '#12283A')} RG ${n2(o.lw || 1.1)} w 1 J 1 j ${p} S Q`);
  }

  /* =====================================================================
     Briques de mise en page
     ===================================================================== */

  /** Titre de section : barre cyan + libelle. */
  h2(txt, o) {
    o = o || {};
    this.place(30);
    this.y += o.avant === undefined ? 8 : o.avant;
    const h = 15;
    this.rect(this.gauche, this.y + 1, 3, h - 2, { fill: o.accent || '#00A9E7' });
    this.texte(txt.toUpperCase(), this.gauche + 9, this.y + 1.5, {
      taille: 10, style: 'b', couleur: '#002F43' });
    this.y += h + 4;
    return this;
  }

  /** Bandeau plein (sous-titre de bloc). */
  bandeau(txt, o) {
    o = o || {};
    const h = o.h || 17;
    this.place(h + 4);
    this.rect(this.gauche, this.y, this.large, h, { fill: o.fond || '#002F43', r: 2 });
    this.texte(txt, this.gauche + 8, this.y + (h - 9) / 2 - 0.5,
      { taille: 9, style: 'b', couleur: o.couleur || '#FFFFFF' });
    if (o.droite) {
      this.texte(o.droite, this.droite - 8, this.y + (h - 9) / 2 - 0.5,
        { taille: 8.5, style: 'n', couleur: o.couleur || '#FFFFFF', align: 'droite' });
    }
    this.y += h + 6;
    return this;
  }

  /** Grille etiquette / valeur sur `cols` colonnes. */
  champs(items, o) {
    o = o || {};
    const cols = o.cols || 2;
    const ecart = 10;
    const cw = (this.large - ecart * (cols - 1)) / cols;
    for (let i = 0; i < items.length; i += cols) {
      const rangee = items.slice(i, i + cols);
      let hmax = 0;
      const prep = rangee.map((it) => {
        const l = couper(it.v || '—', cw - 12, 9.5, it.fort ? 'b' : 'n');
        const h = 11 + l.length * 12 + 7;
        if (h > hmax) hmax = h;
        return { it, l };
      });
      this.place(hmax + 4);
      prep.forEach((p, j) => {
        const x = this.gauche + j * (cw + ecart);
        this.rect(x, this.y, cw, hmax, { fill: '#F5F8FA', r: 2 });
        this.rect(x, this.y, 2.2, hmax, { fill: p.it.accent || '#D8E3EA' });
        this.texte(p.it.k.toUpperCase(), x + 9, this.y + 4,
          { taille: 6.6, style: 'b', couleur: '#5B7387' });
        p.l.forEach((ln, k) => this.texte(ln, x + 9, this.y + 14 + k * 12,
          { taille: 9.5, style: p.it.fort ? 'b' : 'n', couleur: '#12283A' }));
      });
      this.y += hmax + 5;
    }
    if (o.apres) this.y += o.apres;
    return this;
  }

  /** Tableau avec en-tete repete a chaque saut de page. */
  tableau(cfg) {
    const cols = cfg.cols;                       // [{l, w (proportion), align, style}]
    const total = cols.reduce((s, c) => s + c.w, 0);
    const larg = cols.map((c) => (c.w / total) * this.large);
    const pad = 6, taille = cfg.taille || 8.6;
    const dessineEnTete = () => {
      const h = cfg.hEnTete || 18;
      this.place(h + 14);
      this.rect(this.gauche, this.y, this.large, h, { fill: cfg.fondEnTete || '#002F43' });
      let x = this.gauche;
      cols.forEach((c, i) => {
        const tx = c.align === 'centre' ? x + larg[i] / 2 : c.align === 'droite' ? x + larg[i] - pad : x + pad;
        this.texte(c.l, tx, this.y + (h - 7.6) / 2 - 0.5,
          { taille: 7.6, style: 'b', couleur: '#FFFFFF', align: c.align });
        x += larg[i];
      });
      this.y += h;
    };
    dessineEnTete();
    (cfg.rows || []).forEach((row, ri) => {
      const cells = cols.map((c, i) => couper(row[i] == null ? '' : String(row[i]),
        larg[i] - pad * 2, taille, c.style || 'n'));
      const nl = Math.max(1, ...cells.map((c) => c.length));
      const h = Math.max(cfg.hLigne || 17, nl * (taille * 1.32) + 9);
      if (this.y + h > this.bas) { this.nouvellePage(); dessineEnTete(); }
      const fond = cfg.fondLigne ? cfg.fondLigne(row, ri) : null;
      if (fond) this.rect(this.gauche, this.y, this.large, h, { fill: fond });
      else if (ri % 2 === 1) this.rect(this.gauche, this.y, this.large, h, { fill: '#F5F8FA' });
      let x = this.gauche;
      cells.forEach((lignes, i) => {
        const c = cols[i];
        const tx = c.align === 'centre' ? x + larg[i] / 2 : c.align === 'droite' ? x + larg[i] - pad : x + pad;
        lignes.forEach((ln, k) => this.texte(ln, tx, this.y + (h - nl * (taille * 1.32)) / 2 + k * (taille * 1.32) - 0.5,
          { taille, style: c.style || 'n', align: c.align, couleur: c.couleur || '#12283A' }));
        if (i) this.ligne(x, this.y, x, this.y + h, { couleur: '#E3EBF0', lw: 0.5 });
        x += larg[i];
      });
      this.ligne(this.gauche, this.y + h, this.droite, this.y + h, { couleur: '#E3EBF0', lw: 0.5 });
      this.y += h;
    });
    this.y += cfg.apres === undefined ? 8 : cfg.apres;
    return this;
  }

  /** Case a cocher dessinee (vectoriel). */
  case_(x, y, cochee, o) {
    o = o || {};
    const c = o.taille || 9;
    this.rect(x, y, c, c, { fill: cochee ? (o.couleur || '#00A9E7') : '#FFFFFF',
      stroke: cochee ? (o.couleur || '#00A9E7') : '#A9BDCB', lw: 0.8, r: 1.5 });
    if (cochee) {
      this.op(`q ${rgb('#FFFFFF')} RG 1.35 w 1 J 1 j ` +
        `${n2(x + c * 0.24)} ${n2(this.H - (y + c * 0.53))} m ` +
        `${n2(x + c * 0.43)} ${n2(this.H - (y + c * 0.72))} l ` +
        `${n2(x + c * 0.77)} ${n2(this.H - (y + c * 0.3))} l S Q`);
    }
    return this;
  }

  /** Repasse sur chaque page une fois le document complet (pieds de page). */
  finaliser(fn) {
    const n = this.pages.length, sauv = this.flux, sauvY = this.y;
    for (let i = 0; i < n; i++) { this.flux = this.pages[i]; fn(this, i + 1, n); }
    this.flux = sauv; this.y = sauvY;
    return this;
  }

  /* =====================================================================
     Sortie
     ===================================================================== */
  octets() {
    const objets = [];
    const push = (s) => { objets.push(s); return objets.length; };   // renvoie le numero

    const nPages = this.pages.length;
    const idPages = 1;                        // reserve
    objets.push(null);                        // placeholder objet 1 (arbre des pages)

    const idContenus = [], idPageObj = [];
    for (const flux of this.pages) {
      const data = flux.join('\n');
      idContenus.push(push(`<< /Length ${data.length} >>\nstream\n${data}\nendstream`));
    }
    const idF1 = push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const idF2 = push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const idF3 = push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>');

    const xo = [];
    this.imgs.forEach((im, i) => {
      const filtre = im.kind === 'jpeg'
        ? '/Filter /DCTDecode'
        : `/Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns ${im.w} >>`;
      const id = push(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 ${filtre} /Length ${im.bin.length} >>\n` +
        `stream\n${im.bin}\nendstream`);
      xo.push(`/Im${i + 1} ${id} 0 R`);
    });
    const res = `<< /Font << /F1 ${idF1} 0 R /F2 ${idF2} 0 R /F3 ${idF3} 0 R >>` +
      (xo.length ? ` /XObject << ${xo.join(' ')} >>` : '') + ' >>';

    for (let i = 0; i < nPages; i++) {
      idPageObj.push(push(`<< /Type /Page /Parent ${idPages} 0 R /MediaBox [0 0 ${n2(this.W)} ${n2(this.H)}] ` +
        `/Resources ${res} /Contents ${idContenus[i]} 0 R >>`));
    }
    objets[0] = `<< /Type /Pages /Count ${nPages} /Kids [${idPageObj.map((i) => i + ' 0 R').join(' ')}] >>`;

    const d = new Date();
    const z = (v) => String(v).padStart(2, '0');
    const dt = `D:${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
    const idInfo = push(`<< /Title (${esc(toWinAnsi(this.meta.titre))}) /Author (${esc(toWinAnsi(this.meta.auteur))}) ` +
      `/Subject (${esc(toWinAnsi(this.meta.sujet))}) /Creator (Outils HSE CDES) /CreationDate (${dt}) >>`);
    const idCat = push(`<< /Type /Catalog /Pages ${idPages} 0 R >>`);

    let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const pos = [0];
    objets.forEach((o, i) => {
      pos.push(out.length);
      out += `${i + 1} 0 obj\n${o}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= objets.length; i++) {
      out += String(pos[i]).padStart(10, '0') + ' 00000 n \n';
    }
    out += `trailer\n<< /Size ${objets.length + 1} /Root ${idCat} 0 R /Info ${idInfo} 0 R >>\n` +
      `startxref\n${xref}\n%%EOF`;

    const buf = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) buf[i] = out.charCodeAt(i) & 0xFF;
    return buf;
  }

  blob() { return new Blob([this.octets()], { type: 'application/pdf' }); }

  base64() {
    const b = this.octets();
    let s = '';
    for (let i = 0; i < b.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }
}
