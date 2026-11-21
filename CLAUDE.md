# Mes missions — consignes pour Claude Code

## Le projet
Application familiale (PWA) pour motiver une personne en situation de handicap
(appelée « le frère » dans le code et la documentation) : la famille lui envoie
des missions (ranger, marcher, courses…), il gagne des étoiles, et il les
échange contre des récompenses. Le prototype de référence est
`docs/prototype.html`.

## RÈGLE ABSOLUE SUR GIT
L'utilisatrice fait tous les commits elle-même pour vérifier le travail.
- N'exécute JAMAIS : git commit, git push, git add, git reset, git checkout,
  git restore, git stash, git rebase, git merge, git branch, git rm,
  git config, ni aucune commande qui modifie l'historique, l'index,
  les branches ou la configuration git.
- Seules commandes git autorisées : `git status`, `git diff`, `git log`.

## RÈGLE ABSOLUE SUR FIREBASE
- N'exécute JAMAIS de commande qui touche un vrai projet Firebase :
  firebase login, firebase deploy, firebase use, firebase projects…
- Tu peux utiliser uniquement les émulateurs locaux
  (`firebase emulators:start`, `firebase emulators:exec`).
- La mise en ligne est faite par l'utilisatrice, en suivant DEVELOPPEMENT.md.

## Méthode de travail
- Travaille par étapes. À la fin de CHAQUE étape : résume en quelques lignes ce
  que tu as fait, liste les fichiers créés ou modifiés, signale les points à
  relire en priorité, puis ARRÊTE-TOI et attends « continue ».
- Si quelque chose est ambigu, pose la question au lieu de deviner.

## Conventions
- Interface en français, en FALC (Facile à lire et à comprendre) côté frère :
  phrases courtes, tutoiement, une action par écran, texte ≥ 20 px,
  zones tactiles ≥ 56 px, jamais d'information portée par la seule couleur.
- On ne retire JAMAIS d'étoiles au frère (pas de punition).
- Aucune donnée personnelle dans le dépôt (pas de prénom réel, d'adresse
  e-mail, de photo, ni d'information de santé), ni dans le code, ni dans les
  données d'exemple, ni dans les messages proposés.
- HTML, CSS et JavaScript simples (modules ES), sans framework ni étape de
  compilation. Pas de code inline dans le HTML (CSP stricte).
- DEVELOPPEMENT.md est un document personnel : il doit rester dans .gitignore.