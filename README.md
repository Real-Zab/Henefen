# Henefen — déploiement (corrigé)

**Important** : les instructions précédentes que je t'avais données parlaient de "Cloudflare Pages" avec un dossier `functions/`. Ton projet a été créé comme un **Worker**, pas comme un projet Pages — Cloudflare pousse maintenant vers ce nouveau format. Cette version du site est reconstruite pour ce format. Le dossier `functions/` de l'ancien paquet ne sert plus à rien, ignore-le si tu l'as encore.

## Structure de ce paquet
- `public/` — les pages du site (index, boutique, admin). C'est ce qui est servi tel quel.
- `src/index.js` — le code serveur (API produits, admin, etc.)
- `wrangler.jsonc` — la configuration du Worker
- `schema.sql` — à exécuter une fois dans la base D1

## Étapes de déploiement

### 1. Créer la base D1 (si pas déjà fait)
1. Dashboard Cloudflare > **Workers & Pages** > **D1** > **Créer une base de données**, nomme-la `henefen-db`.
2. Onglet **Console** de cette base > colle le contenu de `schema.sql` > exécute.
3. Note l'**ID de la base** (visible sur la page de la base, en haut) — il te le faut à l'étape suivante.

### 2. Renseigner l'ID de la base dans wrangler.jsonc
1. Ouvre `wrangler.jsonc` dans ce paquet.
2. Remplace `REMPLACE_PAR_L_ID_DE_TA_BASE_D1` par l'ID noté à l'étape 1.

### 3. Déposer sur GitHub
Dépose **tout le contenu de ce paquet** (public/, src/, wrangler.jsonc, schema.sql) à la racine de ton dépôt, en remplaçant tout ce qui existait avant (y compris l'ancien dossier `functions/` — supprime-le).

### 4. Redéployer le Worker
Si ton Worker "henefen" est déjà connecté à ce dépôt GitHub, un nouveau déploiement doit se lancer automatiquement. Sinon : Dashboard > ton Worker > **Deployments** > vérifie qu'un build s'est lancé après ton push.

### 5. Lier la base D1 (si l'ID dans wrangler.jsonc ne suffit pas)
1. Dashboard > ton Worker > **Settings** > **Bindings** > **Add binding** > **D1 database**.
2. Nom de variable : `DB`. Sélectionne `henefen-db`.

### 6. Configurer le mot de passe admin
1. **Settings** > **Variables and secrets** (cette section doit maintenant être disponible puisque le Worker a du code, pas juste des fichiers statiques).
2. Ajoute `ADMIN_SESSION_SECRET`, valeur : une phrase longue et aléatoire.
3. Redéploie.

### 7. Vérifier
- `tonsite.workers.dev/` — accueil
- `tonsite.workers.dev/boutique/` — les 2 articles de démo doivent s'afficher
- `tonsite.workers.dev/admin/` — connexion avec `admin@henefen.sn` / `Henefen2026!`, **change ce mot de passe rapidement**

### 8. Créer le bucket R2 (pour les photos)
1. Dashboard Cloudflare > **R2 Object Storage** (dans "Storage & databases" ou via la recherche rapide, comme pour D1) > **Create bucket**.
2. Nom : `henefen-photos` (exactement ce nom, il est déjà référencé dans `wrangler.jsonc`).
3. Après redéploiement (le fichier `wrangler.jsonc` du zip contient déjà la liaison), va dans ton Worker > **Bindings** > vérifie que `PHOTOS` apparaît lié à `henefen-photos`. Si ce n'est pas automatique, ajoute-le manuellement comme tu l'as fait pour D1 (Add binding > R2 bucket > nom `PHOTOS` > sélectionne `henefen-photos`).
4. Exécute la nouvelle table `photos` dans la Console D1 (juste ce petit bloc, pas tout le schema) :
```
CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  target_type TEXT NOT NULL CHECK (target_type IN ('hero','product')),
  target_id INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```
5. Va dans `/admin/`, onglet **Photos** : dépose une photo d'accueil, ou choisis un article et ajoute-lui une photo.

### 9. Ajouter la colonne photo aux catégories
Dans la Console D1, exécute juste cette ligne :
```
ALTER TABLE categories ADD COLUMN photo_key TEXT;
```

## Prochaine étape
Panier, compte — même logique, ajoutées directement dans `src/index.js`. La page produit et les photos par catégorie sont maintenant construites.
