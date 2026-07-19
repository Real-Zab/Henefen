# Henefen — déploiement

## Où en est le site
- **index/** (accueil) et **boutique/** : construites, boutique connectée à une vraie base de données.
- **produit, panier, compte, confirmation, guide-mesures, admin** : pas encore construites — prochaines étapes.

## Étapes de déploiement (sans ligne de commande)

### 1. Créer la base de données D1
1. Dashboard Cloudflare > **Workers & Pages** > **D1** > **Créer une base de données**, nomme-la `henefen-db`.
2. Ouvre l'onglet **Console** de cette base, colle le contenu de `schema.sql`, exécute.

### 2. Déposer le code sur GitHub
1. Crée un dépôt (ex: `henefen-site`) sur GitHub, en glissant-déposant tous les fichiers de ce dossier via l'interface web GitHub ("Add file" > "Upload files").

### 3. Créer le projet Cloudflare Pages
1. Dashboard Cloudflare > **Workers & Pages** > **Créer** > **Pages** > **Connecter à Git**, choisis le dépôt `henefen-site`.
2. Build settings : laisse vide (site statique + fonctions, pas de build).
3. Déploie.

### 4. Lier la base D1 au site
1. Une fois déployé : **Settings** du projet Pages > **Functions** > **D1 database bindings** > **Add binding**.
2. Nom de la variable : `DB` (exactement ce nom, le code le référence ainsi).
3. Sélectionne `henefen-db`. Redéploie pour que le lien prenne effet.

### 5. Vérifier
- Va sur `tonsite.pages.dev/boutique/` — les 2 articles de démonstration du `schema.sql` doivent s'afficher.

## Prochaine étape
Construire produit, panier, compte, admin — même logique : chaque page appelle une fonction dans `functions/api/` qui lit/écrit dans D1.
