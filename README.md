# Strat GT7 – Stratégie d'endurance pour Gran Turismo 7

Calculateur de stratégie pour les courses d'endurance de Gran Turismo 7. Entre ta conso, tes temps au tour et les réglages du salon : l'app compare les stratégies (nombre d'arrêts, ordre des gommes Soft / Medium / Hard) et te donne le plan de relais le plus rapide, avec le carburant à remettre à chaque arrêt.

**App :** https://razhalpox.github.io/strat-gt7/

Fonctionne sur iPhone, Android et ordinateur, hors ligne une fois installée. Tes réglages restent enregistrés sur ton appareil.

---

## GT7 Race Engineer (télémétrie en direct)

Le dossier [`race-engineer`](race-engineer/) contient un ingénieur de course pour GT7 : un petit programme pour PC Windows reçoit la télémétrie de la PS5 et l'affiche en direct sur ton téléphone ou ta tablette (carburant en % et tours restants, alertes stand selon ta stratégie, pneus, chronos, conso par relais, historique), avec un ingénieur vocal en français. Ta vraie conso et tes temps par gomme s'envoient en un clic dans la stratégie incluse.

**Sur Android, sans PC :** installe l'appli depuis ce lien sur ton téléphone : https://github.com/RazHalpox/strat-gt7/releases/download/android/gt7-race-engineer.apk (guide : [race-engineer/LISEZMOI.md](race-engineer/LISEZMOI.md)).

**Télécharger la version PC :** bouton vert **Code → Download ZIP** sur cette page, puis garde le dossier `race-engineer`.
Installation pas à pas : [race-engineer/LISEZMOI.md](race-engineer/LISEZMOI.md).

---

## Installer sur iPhone

1. Ouvre le lien de l'app dans **Safari**.
2. Appuie sur **Partager**, puis **Sur l'écran d'accueil**, puis **Ajouter**.
3. Ouvre l'app une première fois avec du réseau. Ensuite, elle marche sans connexion.

Sur Android, ouvre le lien dans Chrome, puis **⋮ → Ajouter à l'écran d'accueil**.

---

## Tuto

### 1. Régler le salon (onglet Paramètres)
- **Type de course** : à la durée (ex. 60 min) ou au nombre de tours.
- **Refuel rate** : la vitesse de ravitaillement du salon, en litres par seconde.
- **Réservoir** et **carburant au départ**, en litres.

### 2. Mesurer ta conso
En jeu, note ton carburant au début et à la fin de 3 à 5 tours lancés, sans le tour de départ. Fais ta mesure avec les réglages du salon de ta course, puis entre ces deux valeurs et le nombre de tours. L'app calcule ta conso par tour en course et le nombre de tours avec un plein.

Avec un réservoir de 100 L, 1 % de jauge = 1 L.

### 3. Renseigner tes gommes
Pour Soft, Medium et Hard :
- **Temps au tour** moyen sur un relais (pas ton meilleur tour), en m:ss.sss ou en secondes ;
- **Vie (tours)** : nombre de tours que tu peux faire avec cette gomme dans les conditions de ta course, avant que l'usure te coûte trop de temps.

### 4. Régler le stand
- **Changement de pneus uniquement** : chronomètre un tour avec un arrêt pneus seuls, puis retire ton temps au tour normal.
- **Calcul du temps d'arrêt** :
  - *Pneus + litres ÷ refuel rate* : le temps de l'arrêt dépend des litres remis ;
  - *Temps fixes* : tu entres aussi un temps d'arrêt complet, utilisé dès qu'il y a de l'essence à remettre.

### 5. Fixer les règles
Coche les gommes **obligatoires** et le nombre de **gommes différentes requises** (1, 2 ou 3). L'app indique le nombre d'arrêts minimum que ça impose.

### 6. Lire ta stratégie (onglet Stratégie)
- **Chiffres clés** : conso par tour, tours avec un plein, nombre d'arrêts, tours de course et heure d'arrivée.
- **Déroulé de la course** : la frise des relais par gomme, les arrêts et la fin du chrono.
- **Comparer les stratégies** : la meilleure option pour chaque nombre d'arrêts. Clique sur une ligne pour voir son plan.
- **Plan de relais** : la gomme, les tours et la durée de chaque relais, et à chaque arrêt les litres à mettre, le type d'arrêt (pneus + carbu ou pneus seuls) et sa durée.
- **Combien de tours avec…** : le nombre de tours possibles avec 100, 75, 50, 25 L ou la quantité de ton choix.

Le bouton **Reset**, en bas des Paramètres, remet les valeurs d'exemple. Il demande une confirmation.

---

## À savoir
- Les valeurs pré-remplies sont des **exemples** : remplace-les par tes propres mesures.
- L'app cherche le temps le plus court. Elle peut proposer un relais très court sur la gomme la plus lente, juste pour respecter les règles.
- Le calcul ne prend pas en compte le trafic, la météo, la perte de rythme liée à l'usure ni le mapping carburant.
