# Zinc Grenadine mobile — mise en ligne

La version mobile est un petit site internet. Elle se connecte au **même dossier Google Drive** que
l'application sur ordinateur : ce qui est saisi sur un téléphone apparaît sur l'ordinateur, et inversement.
Les données ne passent jamais par le site lui-même : il ne contient que l'interface.

Compter environ 30 minutes, une seule fois. Il faut :

- l'application sur ordinateur en **base partagée dans un dossier Google Drive**
  (Paramètres › Travail à plusieurs) ;
- le compte Google de l'association (celui qui possède ce dossier) ;
- un compte GitHub gratuit, pour héberger le site.

---

## Étape 1 — Héberger le site sur GitHub Pages (gratuit)

1. Créez un compte sur <https://github.com> (par exemple au nom de l'association, « zincgrenadine »).
2. Créez un dépôt **public** nommé `zinc-mobile` : bouton **New repository**, cochez *Add a README file*, puis **Create repository**.
3. Dans le dépôt : **Add file › Upload files**. Glissez **le contenu** du dossier `ZincGrenadine-mobile`
   (le fichier `index.html` doit être à la racine du dépôt, pas dans un sous-dossier), puis **Commit changes**.
4. **Settings › Pages** : *Source* « Deploy from a branch », branche `main`, dossier `/ (root)`, **Save**.
5. Après une à deux minutes, le site est en ligne à l'adresse :
   `https://VOTRE-COMPTE.github.io/zinc-mobile/`

> Le dépôt est public, mais il ne contient que le code de l'interface : aucune donnée de l'association.

## Étape 2 — Créer l'identifiant Google de l'association

Le site doit être reconnu par Google pour avoir le droit d'ouvrir le dossier Drive.
Allez sur <https://console.cloud.google.com> avec le compte Google de l'association.

1. **Créer un projet** : menu des projets en haut › *Nouveau projet* › nom « Zinc Grenadine » › *Créer*.
2. **Activer l'API Google Drive** : *API et services › Bibliothèque* › cherchez « Google Drive API » › *Activer*.
3. **Google Auth Platform** (menu de gauche, ou cherchez « Google Auth Platform ») › *Commencer* :
   - nom de l'application : `Zinc Grenadine` ; adresse e-mail d'assistance : celle de l'association ;
   - audience : **Externe** ;
   - coordonnées : l'adresse de l'association › *Créer*.
4. **Audience** › *Utilisateurs tests* › **Ajouter des utilisateurs** : saisissez l'adresse Gmail de
   chaque personne qui utilisera la version mobile (100 au maximum). Laissez l'application « En test » :
   inutile de la publier ni de la faire valider par Google.
5. **Accès aux données** › *Ajouter ou supprimer des niveaux d'accès* › cochez
   `https://www.googleapis.com/auth/drive` (Google Drive : voir, modifier, créer et supprimer) › *Mettre à jour* › *Enregistrer*.
6. **Clients** › *Créer un client* :
   - type : **Application Web** ; nom : « Site mobile » ;
   - *Origines JavaScript autorisées* : `https://VOTRE-COMPTE.github.io` (sans `/zinc-mobile` à la fin) ;
   - *Créer*. Copiez l'**ID client** (il finit par `.apps.googleusercontent.com`). Le « code secret » ne sert pas.

Les réglages Google peuvent mettre quelques minutes à s'appliquer.

## Étape 3 — Relier l'application et distribuer le lien

1. Dans l'application sur ordinateur : **Paramètres › Version mobile**. Collez l'adresse du site
   et l'ID client : un **QR code** apparaît.
2. Sur chaque téléphone : scannez le QR code avec l'appareil photo, touchez **Se connecter avec Google**.
   - Google affiche « Google n'a pas validé cette application » : c'est normal pour une application
     d'association en test. Touchez **Continuer**, puis autorisez l'accès à Google Drive.
3. Pour l'avoir comme une application : **Ajouter à l'écran d'accueil**
   (iPhone, Safari : bouton Partager ; Android, Chrome : menu ⋮).

Chaque personne doit aussi avoir **accès au dossier partagé** sur Google Drive (clic droit sur le dossier
de la base › *Partager*) et figurer dans la liste des utilisateurs tests (étape 2.4).

---

## Ce que fait la version mobile

| Sur le téléphone | Sur l'ordinateur |
|---|---|
| Contacts : consulter, appeler, écrire, itinéraire ; créer et modifier | idem, plus la facturation |
| Dons : saisir un don (montant, donateur, adresse) | comptabilisé automatiquement à son arrivée ; reçu fiscal Cerfa |
| Adhésions : nouvelle adhésion, renouvellements de la saison | comptabilisée automatiquement |
| Réunions : ordre du jour, présences, statut, compte rendu, documents joints | convocations, PDF, décisions, archivage |
| CA, bureau, bénévoles : annuaire, nouveaux bénévoles | mandats, fonctions, valorisation du bénévolat |
| Budget de l'édition : prévu et réalisé | préparation du budget |
| Justificatifs : photo d'un ticket ou d'une facture | lue automatiquement, numérotée, à comptabiliser |

Hors connexion, le téléphone affiche les dernières données connues (consultation seulement).

Si une fiche a été modifiée sur un autre poste pendant que vous la modifiiez sur le téléphone,
le site n'écrase rien : il affiche la version à jour et vous demande de refaire la modification.

## Mettre à jour le site

Pour publier une nouvelle version : dans le dépôt GitHub, **Add file › Upload files**, glissez les
nouveaux fichiers (ils remplacent les anciens), **Commit changes**. Les téléphones la reçoivent à
la prochaine ouverture.

## En cas de problème

- **« Dossier introuvable »** : ce compte Google n'a pas accès au dossier `ZincGrenadine-base`,
  ou l'application sur ordinateur n'est pas en base partagée sur Google Drive.
- **« Accès bloqué » / erreur 400 `origin_mismatch`** : l'origine déclarée à l'étape 2.6 ne correspond
  pas exactement à l'adresse du site (vérifiez `https://` et l'absence de `/` final).
- **« Accès refusé » / `access_denied`** : l'adresse Gmail n'est pas dans les utilisateurs tests (étape 2.4).
- **Un don saisi n'apparaît pas sur l'ordinateur** : Google Drive pour ordinateur synchronise en
  général en moins d'une minute ; vérifiez qu'il est bien démarré.
- Dans le site, **Plus › Compte et réglages** permet de changer de dossier, de tout retélécharger
  ou de se déconnecter.
