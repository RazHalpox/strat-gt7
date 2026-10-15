# GT7 Race Engineer

Ton ingénieur de course pour Gran Turismo 7 : télémétrie en direct sur ton téléphone, ingénieur vocal en français, et ton calculateur de stratégie d'endurance rempli automatiquement avec ta vraie conso et tes vrais temps.

**Comment ça marche :** la PS5 envoie la télémétrie de GT7 sur ton réseau. Un petit programme sur ton PC la reçoit et l'affiche sur ton téléphone. Les trois appareils doivent être sur **la même box / le même Wi-Fi**.

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

## L'écran Course (jour de course)

Ouvre `http://IP-DU-PC:8777/course.html`, ou l'onglet **Course**. Il n'affiche que l'essentiel, en très gros :
- **tours de carburant restants**, avec les litres et la jauge ;
- **dernier tour** et écart au meilleur ;
- **tour en cours** et position ;
- **température des 4 pneus**.

**La bannière suit ta stratégie.** Ouvre d'abord l'onglet **Stratégie** sur le même appareil et choisis ton plan : l'écran Course le reprend. Trois tours avant chaque arrêt prévu, une bannière jaune affiche « Arrêt dans X tours » avec la gomme du relais suivant et les litres à mettre (ou « pneus seuls »). Au tour de l'arrêt, elle passe au rouge clignotant : **BOX BOX**. L'ingénieur vocal annonce les mêmes infos.

Sécurité : si le carburant ne tient pas jusqu'à l'arrêt prévu, **BOX BOX — Carburant critique** s'affiche quand même. Sans plan enregistré, la bannière se base sur le carburant seul.

L'ingénieur vocal y est aussi. En paysage, les blocs se réorganisent selon la taille de l'écran.

## Le dashboard complet

- **Chrono** : tour en cours, dernier tour, meilleur tour, écart, position, moyenne des 3 derniers tours.
- **Carburant** : litres, jauge, **tours restants** (calculés avec ta conso réelle), conso par tour, et carburant manquant pour finir si la course est au nombre de tours.
- **Pneus** : température des 4 pneus. Bleu = froid, vert = bon, jaune puis rouge = chaud. Ces seuils sont indicatifs.
- **Pilotage** : rapport, vitesse, régime avec témoins de passage, accélérateur et frein, TCS / ASM / rupteur, températures eau et huile.
- **Historique** : chaque tour avec son temps, son écart au meilleur et sa conso. Les tours avec arrêt au stand sont marqués et exclus des moyennes.

### L'ingénieur vocal
Appuie sur **🎧 Ingénieur off** pour l'activer. Il annonce à chaque tour ton temps, tes meilleurs tours et le carburant restant, et il te prévient quand il faut rentrer au stand. Monte le son du téléphone, ou connecte un casque.

### Envoyer vers la stratégie
Après quelques tours sans arrêt :
- **Utiliser ma conso** : enregistre ta conso moyenne réelle dans la stratégie ;
- **Temps moyen en [gomme] → Enregistrer** : enregistre ton temps moyen pour la gomme que tu as montée. Fais-le pour Soft, Medium et Hard.

Ouvre ensuite **Stratégie →** : tes valeurs sont déjà remplies. Complète la vie de tes gommes dans Paramètres, et la stratégie se calcule.

---

## Garder l'écran allumé

Règle la mise en veille de l'appareil pendant tes courses :
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
