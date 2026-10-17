# GT7 Race Engineer · v1.3

Ton ingénieur de course pour Gran Turismo 7 : télémétrie en direct sur ton téléphone, ingénieur vocal en français, et ton calculateur de stratégie d'endurance rempli automatiquement avec ta vraie conso et tes vrais temps.

**Comment ça marche :** la PS5 envoie la télémétrie de GT7 sur ton réseau. Un petit programme sur ton PC la reçoit et l'affiche sur ton téléphone. Les trois appareils doivent être sur **la même box / le même Wi-Fi**.

---

## Sur Android : l'appli, sans PC

Sur un téléphone ou une tablette Android, l'appli reçoit elle-même la télémétrie de la PS5. Pas besoin du PC ni de Python.

**Installer (une seule fois)**
1. Sur le téléphone Android, ouvre ce lien : https://github.com/RazHalpox/strat-gt7/releases/download/android/gt7-race-engineer.apk
2. Ouvre le fichier téléchargé. Android demande d'autoriser l'installation depuis Chrome (ou « Fichiers ») : accepte, puis **Installer**.
3. Si Play Protect affiche un avertissement (appli inconnue), touche **Plus de détails → Installer quand même**.

**Mises à jour :** l'appli vérifie toute seule au démarrage s'il existe une nouvelle version et propose de l'installer (bouton **Rechercher une mise à jour** sur l'accueil, ou ⚙ Réglages › Appli Android). La première fois, Android demande d'autoriser l'appli à installer des applis. La nouvelle version s'installe par-dessus et garde tes réglages et ta stratégie.

**En course**
1. Ouvre **GT7 Engineer**, tape l'adresse IP de la PS5 (ou laisse vide pour la recherche automatique), puis **Démarrer**.
2. Lance une course ou un essai dans GT7 : les écrans Pilote, Complet, Stratégie et ⚙ sont les mêmes que sur le PC, avec l'ingénieur vocal.
3. Le bouton retour ramène à l'accueil ; la réception continue. Arrête-la avec **Arrêter la réception** ou depuis la notification.

**Avec un iPad en plus :** pendant que l'appli tourne, l'iPad peut ouvrir l'adresse affichée sur l'accueil de l'appli (`http://IP-DU-TÉLÉPHONE:8777/pilote.html`). Le téléphone remplace alors le PC.

Le **mode démo** de l'accueil fait tourner une course simulée, pour essayer sans la PS5.

---

## 1. Installer Python sur le PC (une seule fois)

1. Va sur **python.org → Downloads** et télécharge la dernière version pour Windows.
2. Lance l'installation et **coche « Add python.exe to PATH »** en bas de la première fenêtre.
3. Clique sur **Install Now**.

## 2. Préparer le dossier

Dézippe `gt7-race-engineer.zip` où tu veux, par exemple sur le Bureau. Tout doit rester dans le même dossier.

## 3. Tester sans la PS5 (mode démo)

1. Double-clique sur **lancer-demo.bat**.
2. Si Windows affiche une alerte du **pare-feu**, coche **Réseaux privés** et clique sur **Autoriser**. Sans ça, le téléphone ne pourra pas se connecter.
3. La fenêtre affiche une adresse, par exemple `http://192.168.1.15:8777`.
4. Ouvre cette adresse sur ton téléphone : tu vois une course simulée.

## 4. Trouver l'adresse IP de la PS5

Sur la PS5 : **Paramètres → Réseau → État de la connexion → Afficher l'état de la connexion → Adresse IPv4**. Note-la, par exemple `192.168.1.20`.

Conseil : dans les réglages de ta box, attribue une IP fixe à la PS5 pour ne pas avoir à la changer.

## 5. En course

1. Double-clique sur **lancer.bat**. La première fois, tape l'adresse IP de la PS5 et appuie sur Entrée. Elle est retenue pour la suite.
2. Lance une course ou un essai libre dans GT7.
3. Ouvre l'adresse affichée sur ton téléphone. Le voyant passe à **En direct**.
4. Laisse la fenêtre noire ouverte pendant toute la course.

**Sur iPhone :** dans Safari, Partager → Sur l'écran d'accueil, pour l'ouvrir comme une app.
**Sur Android :** dans Chrome, ⋮ → Ajouter à l'écran d'accueil.

---

## L'écran Pilote (pendant la course)

Ouvre `http://IP-DU-PC:8777/pilote.html`, ou l'onglet **Pilote**. Il s'adapte à l'iPad et au téléphone, en paysage comme en portrait.
- **Carburant** (à gauche) : tours restants en gros, niveau en **% du réservoir** (1 décimale), jauge, conso moyenne et du dernier tour en %, bandeau du prochain arrêt de ta stratégie (gomme et carburant à remettre, recalculé en direct avec ta vraie conso), la conso de tes 10 derniers tours, et ta **conso moyenne de chaque relais** (avec sa gomme et la moyenne de la course).
- **Alertes stand** : quelques tours avant l'arrêt (jaune), au tour du BOX BOX (rouge), ou si l'essence ne tient pas jusqu'à l'arrêt ou l'arrivée (« Essence courte »), l'alerte clignote aussi en gros au-dessus du rapport engagé.
- **Pneus** (à droite) : gomme et relais en cours selon ta stratégie, usure du relais (tours faits / vie de la gomme), température des 4 pneus en couleur, et alertes **BLOQUE** (roue bloquée au freinage) ou **PATINE** (roue qui patine à l'accélération).
- **Au centre** : rapport engagé, vitesse, tour, position, turbo, et tes chronos (tour en cours, dernier, meilleur).
- En haut, la barre de régime clignote au rupteur.

**Attention :** SimHub et le Race Engineer utilisent le même port. Ferme SimHub avant de lancer le relais.

## Le dashboard complet

- **Chrono** : tour en cours, dernier tour, meilleur tour, écart, position, moyenne des 3 derniers tours.
- **Carburant** : niveau en % du réservoir, jauge, **tours restants** (calculés avec ta conso réelle), conso par tour en %, et ce qu'il manque jusqu'au prochain arrêt ou pour finir (« OK » si ça passe).
- **Pneus** : température des 4 pneus. Bleu = froid, vert = bon, jaune puis rouge = chaud. Ces seuils sont indicatifs.
- **Pilotage** : rapport, vitesse, régime avec témoins de passage, accélérateur et frein, TCS / ASM / rupteur, températures eau et huile.
- **Historique** : chaque tour avec son temps, son écart au meilleur et sa conso. Les tours avec arrêt au stand sont marqués et exclus des moyennes.

### L'ingénieur vocal
Appuie sur **🎧 Ingénieur off** pour l'activer. Il annonce à chaque tour ton temps, tes meilleurs tours et le carburant restant. Il suit ta stratégie : « Arrêt dans X tours, on passe en Medium », puis « Box box, ce tour-ci, Medium, 22 pour cent », et il te prévient si l'essence ne tiendra pas. Monte le son du téléphone, ou connecte un casque.

### Envoyer vers la stratégie
Après quelques tours sans arrêt :
- **Utiliser ma conso** : enregistre ta conso moyenne réelle dans la stratégie ;
- **Temps moyen en [gomme] → Enregistrer** : enregistre ton temps moyen pour la gomme que tu as montée. Fais-le pour Soft, Medium et Hard.

Ouvre ensuite **Stratégie →** : tes valeurs sont déjà remplies. Complète la vie de tes gommes dans Paramètres, et la stratégie se calcule.

---

### Plan B : arrêt imprévu (accident, crevaison…)

Sur Pilote, le bouton **Plan B** recalcule la fin de la course si tu rentres **à la fin du tour en cours** : il part de ton tour, de ton essence, des gommes déjà roulées et des règles de Stratégie, et propose la meilleure option pour chaque gomme (gomme à monter, essence à remettre ou pneus seuls, arrêts suivants). Touche une option : le bandeau passe en « Box box · ce tour-ci » avec ce choix, et tout le plan des écrans est mis à jour.

**Automatique dans la voie des stands :** quand tu entres dans la voie des stands à un tour qui n'est pas un arrêt prévu, l'appli le reconnaît au limiteur (vitesse figée), ouvre le Plan B toute seule et l'ingénieur annonce le meilleur choix. Il ne reste qu'à toucher l'option.

En dernier recours, si un arrêt hors plan est passé inaperçu, l'appli demande ensuite quelle gomme tu as montée et recalcule la suite.

Le calcul prend quelques millisecondes et utilise tes temps au tour et la vie des gommes de Stratégie › Paramètres, avec ta conso réelle. Tant que tu ne touches à rien dans Stratégie, le Plan B reste actif ; le bouton « Revenir au plan » de Stratégie le remplace par le plan d'origine.

### Disposition de l'écran Pilote

Le bouton **▦** (en haut à droite de Pilote) ouvre le mode **Disposition** :
- glisse une fenêtre (Carburant, Rapport et vitesse, Chronos, Pneus) sur une autre : **au centre** elles s'échangent, **sur un bord** (gauche, droite, haut, bas) elle se place à côté ;
- **✕ Masquer** retire une fenêtre ; elle réapparaît avec le bouton **+ Nom** dans la barre ;
- **Par défaut** remet la disposition d'origine, **Terminé** quitte le mode.

Les colonnes s'alignent toutes seules et les chiffres s'adaptent à la taille de chaque fenêtre. En portrait, les fenêtres s'empilent dans le même ordre (on glisse avec la poignée ✥). La disposition est enregistrée sur l'appareil.

## ⚙ Réglages

L'onglet avec la roue crantée, à droite de Stratégie, regroupe les options. Elles s'appliquent tout de suite sur les autres écrans :
- **Apparence** : thème **Classique** ou **Racing GT3** (fond carbone, rouge course, chiffres italiques façon écran de volant), appliqué à tous les écrans de cet appareil ;
- **Arrêts** : alerte d'arrêt de 1 à 5 tours avant (ou désactivée), alerte carburant critique / essence courte ;
- **Écran Complet** : afficher ou masquer la bande radio ;
- **Ingénieur vocal** : temps de chaque tour, meilleurs tours, point carburant (tous les N tours), vitesse de la voix ;
- **Carburant** : nombre de tours pour la conso moyenne, seuils jaune et rouge de la jauge ;
- **Pneus** : températures froid / chaud / trop chaud, seuil de blocage / patinage (en %).

Les réglages sont enregistrés sur l'appareil (iPad, téléphone) où tu les modifies.

## Garder l'écran allumé

Dans l'appli Android, l'écran reste allumé tout seul. Dans un navigateur (iPhone, iPad, PC), règle la mise en veille de l'appareil pendant tes courses :
- **iPhone / iPad** : Réglages → Luminosité et affichage → Verrouillage auto → **Jamais** (pense à le remettre après).
- **Android** : Paramètres → Affichage → Mise en veille de l'écran → la durée la plus longue.

## En cas de problème

| Problème | Solution |
|---|---|
| « Python est introuvable » | Réinstalle Python en cochant **Add python.exe to PATH**, puis redémarre le PC. |
| Le téléphone n'ouvre pas la page | Vérifie qu'il est sur le même Wi-Fi que le PC (pas en 4G/5G) et que le pare-feu Windows autorise Python sur les **réseaux privés**. |
| « En attente de la PS5 » | Vérifie l'adresse IP de la PS5 (relance `lancer.bat` pour la changer) et sois en piste dans GT7, pas dans les menus. |
| L'ingénieur ne parle pas | Appuie sur le bouton Ingénieur après avoir ouvert la page, et vérifie que le téléphone n'est pas en mode silencieux. |

---

À savoir : le format de la télémétrie GT7 n'est pas documenté officiellement par Polyphony. Le programme s'appuie sur le format décrit par la communauté. Les données transitent uniquement sur ton réseau local : rien ne part sur Internet.
