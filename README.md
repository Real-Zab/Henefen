# Henefen — déploiement

## Où en est le site
- **index/** (accueil) et **boutique/** : construites, boutique connectée à une vraie base de données.
- **admin/** : construite — connexion, gestion catalogue (créer/masquer/supprimer), libellés des catégories, taux de conversion.
- **produit, panier, compte, confirmation, guide-mesures** : pas encore construites — prochaines étapes.
- **Upload de photos depuis l'admin** : pas encore branché (nécessite Cloudflare R2, une étape en plus) — pour l'instant les photos restent en placeholder.

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

### 5. Configurer l'accès admin
1. **Settings** > **Environment variables** > **Add variable**.
2. Nom : `ADMIN_SESSION_SECRET`, valeur : une phrase longue et aléatoire (ex: 40 caractères au hasard) — ça sert à sécuriser la connexion admin, garde-la secrète.
3. Redéploie.
4. Va sur `tonsite.pages.dev/admin/`, connecte-toi avec `admin@henefen.sn` / `Henefen2026!`.
5. **Change ce mot de passe tout de suite** — pour l'instant il n'y a pas encore d'écran "changer mon mot de passe" dans l'admin, dis-le moi et je l'ajoute en priorité.

### 6. Vérifier
- Va sur `tonsite.pages.dev/boutique/` — les 2 articles de démonstration du `schema.sql` doivent s'afficher.

## Prochaine étape
Construire produit, panier, compte — même logique : chaque page appelle une fonction dans `functions/api/` qui lit/écrit dans D1.
Upload de photos réel : nécessitera Cloudflare R2 (stockage fichiers) branché à l'admin.
