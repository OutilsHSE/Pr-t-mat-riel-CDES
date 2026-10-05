# Prêt de matériel — CDES

Outil du service HSE : convention de mise à disposition d'un engin et fiche de prêt pour un conducteur extérieur, avec signatures, état des lieux contradictoire et PDF générés dans le navigateur.

## Organisation des fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Structure de la page (aucun code ni style dedans) |
| `css/pret.css` | Apparence, charte CDES |
| `js/pret.js` | Fonctionnement : saisie, signatures, synchronisation, envoi |
| `js/pdf.js` | Moteur PDF, 100 % navigateur, sans bibliothèque externe |
| `js/pdf-ressources.js` | Métriques de police et logo pour le PDF (fichier généré, ne pas éditer à la main) |
| `data/listes.json` | Listes modifiables sans toucher au code : engins, CACES, points de l'état des lieux, règles du conducteur |

## Ce que ce dépôt ne contient pas, volontairement

- **Aucune donnée personnelle** : les noms, téléphones, chefs d'agence et représentants légaux sont dans le classeur privé « Référentiel CDES » et sont servis par le serveur de l'outil, uniquement à un appareil branché.
- **Aucune adresse de serveur ni aucun mot de passe** : un appareil se branche en ouvrant l'outil depuis l'intranet HSE (après son mot de passe), ou exceptionnellement avec un lien de branchement personnel, jamais publié.
- **Aucun code serveur** (`.gs`) : il est versionné à part, dans un dépôt privé.

`data/listes.json` ne doit contenir que des listes non sensibles. Tout fichier de ce dépôt est public.

## Modifier une liste

Éditer `data/listes.json` sur GitHub (crayon), garder le format, valider. Les appareils reprennent la nouvelle liste au prochain chargement ; sans réseau, ils utilisent la dernière liste reçue.
